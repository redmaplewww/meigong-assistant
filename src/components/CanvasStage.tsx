import { useEffect, useMemo, useRef, useState } from "react";
import { renderTemplateToCanvas } from "../core/renderer";
import type { Layer, Template } from "../core/types";

interface CanvasStageProps {
  template: Template;
  selectedLayerId?: string;
  zoom: number;
  onSelectLayer: (layerId: string) => void;
  onPatchLayer: (layerId: string, patch: Partial<Layer>) => void;
}

function pointInLayer(layer: Layer, x: number, y: number): boolean {
  return x >= layer.x && x <= layer.x + layer.width && y >= layer.y && y <= layer.y + layer.height;
}

function pointerToCanvas(event: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
}

export function CanvasStage({ template, selectedLayerId, zoom, onSelectLayer, onPatchLayer }: CanvasStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<{
    layerId: string;
    startX: number;
    startY: number;
    originalX: number;
    originalY: number;
  } | null>(null);

  const selectedLayer = useMemo(
    () => template.layers.find((layer) => layer.id === selectedLayerId),
    [selectedLayerId, template.layers],
  );

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    renderTemplateToCanvas(canvas, template).then(() => {
      if (cancelled) return;
    });

    return () => {
      cancelled = true;
    };
  }, [template]);

  const displayWidth = Math.round(template.canvas.width * zoom);
  const displayHeight = Math.round(template.canvas.height * zoom);

  return (
    <div className="stage-shell">
      <div
        className="stage-scroll"
        style={{
          width: "100%",
        }}
      >
        <div
          ref={overlayRef}
          className="canvas-wrap"
          style={{
            width: displayWidth,
            height: displayHeight,
          }}
        >
          <canvas
            ref={canvasRef}
            className="artboard-canvas"
            style={{ width: displayWidth, height: displayHeight }}
            onPointerDown={(event) => {
              const canvas = canvasRef.current;
              if (!canvas) return;
              const point = pointerToCanvas(event, canvas);
              const hit = [...template.layers]
                .filter((layer) => layer.visible && layer.editable && !layer.locked)
                .sort((a, b) => b.zIndex - a.zIndex)
                .find((layer) => pointInLayer(layer, point.x, point.y));

              if (!hit) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              onSelectLayer(hit.id);
              setDrag({
                layerId: hit.id,
                startX: point.x,
                startY: point.y,
                originalX: hit.x,
                originalY: hit.y,
              });
            }}
            onPointerMove={(event) => {
              const canvas = canvasRef.current;
              if (!canvas || !drag) return;
              const point = pointerToCanvas(event, canvas);
              onPatchLayer(drag.layerId, {
                x: Math.round(drag.originalX + point.x - drag.startX),
                y: Math.round(drag.originalY + point.y - drag.startY),
              } as Partial<Layer>);
            }}
            onPointerUp={(event) => {
              if (drag) event.currentTarget.releasePointerCapture(event.pointerId);
              setDrag(null);
            }}
            onPointerCancel={() => setDrag(null)}
          />
          {selectedLayer ? (
            <div
              className="selection-box"
              style={{
                left: selectedLayer.x * zoom,
                top: selectedLayer.y * zoom,
                width: selectedLayer.width * selectedLayer.scale * zoom,
                height: selectedLayer.height * selectedLayer.scale * zoom,
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
