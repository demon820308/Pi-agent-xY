'use client';

export interface UserSelection {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  elementHtml?: string;
}

interface AnnotatedImageProps {
  src: string;
  selections: UserSelection[];
  onSelectionChange?: (selections: UserSelection[]) => void;
  interactive?: boolean;
  labels?: Map<number, string>;
}

export function AnnotatedImage({ src, selections, interactive = false }: AnnotatedImageProps) {
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <img
        src={src}
        alt="Screenshot"
        style={{ maxWidth: '100%', display: 'block' }}
      />
      {selections.map((sel) => (
        <div
          key={sel.id}
          style={{
            position: 'absolute',
            left: `${sel.x * 100}%`,
            top: `${sel.y * 100}%`,
            width: `${sel.w * 100}%`,
            height: `${sel.h * 100}%`,
            border: '2px solid rgba(37,99,235,0.7)',
            background: 'rgba(37,99,235,0.1)',
            pointerEvents: interactive ? 'auto' : 'none',
            borderRadius: 4,
          }}
        />
      ))}
    </div>
  );
}
