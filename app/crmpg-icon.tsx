import { ImageResponse } from 'next/og'

type CrmpgIconProps = {
  size: number
  fontSize: number
}

export function CrmpgIconMarkup({ size, fontSize }: CrmpgIconProps) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
        borderRadius: size * 0.22,
        color: '#ffffff',
        fontSize,
        fontWeight: 800,
        letterSpacing: size <= 32 ? -0.5 : 0.5,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      CRMPG
    </div>
  )
}

export function crmpgIconImage(size: number, fontSize: number) {
  return new ImageResponse(<CrmpgIconMarkup size={size} fontSize={fontSize} />, {
    width: size,
    height: size,
  })
}
