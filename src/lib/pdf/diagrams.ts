import type { DocNode } from "./types";

/**
 * Rendered diagram: a PNG data URL plus the source SVG's natural size in
 * CSS px (doc-def.ts converts to points and fits it to the page).
 */
export type RenderedDiagram = {
  dataUrl: string;
  width: number;
  height: number;
};

export type DiagramRender = (code: string) => Promise<RenderedDiagram>;

/**
 * Rasterize at 3x the natural CSS-px size. Placed at natural size (px x
 * 0.75pt) that is ~288 DPI -- past the 226 PPI of the target e-ink panel,
 * so the raster never shows before the paper does.
 */
const RASTER_SCALE = 3;

let initialized = false;
let renderCount = 0;

async function loadMermaid() {
  const mermaid = (await import("mermaid")).default;
  if (!initialized) {
    mermaid.initialize({
      startOnLoad: false,
      // Grayscale-friendly output for e-ink; also the least saturated of
      // mermaid's built-in themes on a white PDF page.
      theme: "neutral",
      // Keep flowchart labels as SVG <text> instead of <foreignObject>
      // HTML: foreignObject inside an SVG loaded as an <img> is the one
      // part of rasterization with real cross-browser risk (Safari).
      flowchart: { htmlLabels: false },
    });
    initialized = true;
  }
  return mermaid;
}

function svgSize(root: Element): { width: number; height: number } | null {
  const viewBox = root.getAttribute("viewBox");
  if (viewBox) {
    const parts = viewBox
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      return { width: parts[2], height: parts[3] };
    }
  }
  const width = Number.parseFloat(root.getAttribute("width") ?? "");
  const height = Number.parseFloat(root.getAttribute("height") ?? "");
  if (width > 0 && height > 0) return { width, height };
  return null;
}

async function rasterize(
  svg: string,
  width: number,
  height: number,
): Promise<string> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () =>
      reject(new Error("The rendered diagram could not be loaded."));
    // encodeURIComponent, not btoa: the diagram may contain non-Latin-1
    // text, which btoa rejects outright.
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * RASTER_SCALE);
  canvas.height = Math.ceil(height * RASTER_SCALE);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable.");
  // White fill first: pdfmake composites PNG alpha, but e-ink renderers
  // are less predictable about it, and the page is white regardless.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

/**
 * Renders one mermaid source block to a PNG data URL, entirely in the
 * browser: mermaid draws the SVG, the browser rasterizes it on a canvas.
 * Browser-only (needs real layout and canvas), so jsdom tests exercise
 * everything around it via the injectable `render` parameter below and
 * this function is verified against the dev server instead.
 */
export const renderMermaidToPng: DiagramRender = async (code) => {
  const mermaid = await loadMermaid();
  const id = `pdf-mermaid-${renderCount++}`;

  let svg: string;
  try {
    ({ svg } = await mermaid.render(id, code));
  } catch (error) {
    // A failed render can strand mermaid's temp container in the body.
    document.getElementById(id)?.remove();
    document.getElementById(`d${id}`)?.remove();
    throw error;
  }

  const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = parsed.documentElement;
  const size = root.tagName === "svg" ? svgSize(root) : null;
  if (!size) throw new Error("The rendered diagram has no usable size.");

  // Mermaid emits width="100%"; an <img> needs concrete dimensions to
  // give the drawing an intrinsic size (Firefox refuses to draw a
  // dimensionless SVG onto a canvas at all).
  root.setAttribute("width", String(size.width));
  root.setAttribute("height", String(size.height));

  const dataUrl = await rasterize(
    new XMLSerializer().serializeToString(root),
    size.width,
    size.height,
  );
  return { dataUrl, ...size };
};

function hasDiagram(nodes: DocNode[]): boolean {
  return nodes.some(
    (node) =>
      node.kind === "diagram" ||
      (node.kind === "quote" && hasDiagram(node.children)) ||
      (node.kind === "list" && node.items.some(hasDiagram)),
  );
}

/**
 * Replaces every `diagram` node (top-level or nested in quotes/lists) with
 * a rendered `image` node. A diagram whose render fails -- invalid mermaid
 * source, or the mermaid chunk failing to load -- degrades to a `code`
 * node, so the rest of the document still exports.
 *
 * Returns the input array itself when it contains no diagrams: the common
 * no-diagram document never touches `render`, so the mermaid bundle is
 * only downloaded for documents that actually use it. Diagrams render
 * sequentially, not concurrently -- mermaid shares DOM scratch space
 * across renders.
 */
export async function renderDocDiagrams(
  nodes: DocNode[],
  render: DiagramRender = renderMermaidToPng,
): Promise<DocNode[]> {
  if (!hasDiagram(nodes)) return nodes;

  const result: DocNode[] = [];
  for (const node of nodes) {
    switch (node.kind) {
      case "diagram":
        try {
          const { dataUrl, width, height } = await render(node.code);
          result.push({ kind: "image", dataUrl, width, height });
        } catch {
          result.push({ kind: "code", text: node.code });
        }
        break;
      case "quote":
        result.push({
          ...node,
          children: await renderDocDiagrams(node.children, render),
        });
        break;
      case "list": {
        const items: DocNode[][] = [];
        for (const item of node.items) {
          items.push(await renderDocDiagrams(item, render));
        }
        result.push({ ...node, items });
        break;
      }
      default:
        result.push(node);
    }
  }
  return result;
}
