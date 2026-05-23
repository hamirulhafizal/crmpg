export type ImageAspectMode = 'square' | 'fit' | 'original'

export type ImageTextAlign = 'left' | 'center' | 'right'

export type ImageTextLayer = {
  id: string
  /** Template token without braces, e.g. SenderName */
  variable: string
  /** 0–100 percent of design canvas width */
  x: number
  /** 0–100 percent of design canvas height */
  y: number
  font_family: string
  font_size: number
  color: string
  align: ImageTextAlign
  font_weight?: number
}

export type ImageStepParameters = {
  step_order?: number
  delay_days?: number
  send_time?: string
  is_active?: boolean
  enable_typing?: boolean
  randomize_spaces?: boolean
  caption_template?: string
  background_path?: string
  background_mimetype?: string
  canvas_width?: number
  canvas_height?: number
  aspect_mode?: ImageAspectMode
  layers?: ImageTextLayer[]
}

export const IMAGE_FONT_OPTIONS = [
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Helvetica, sans-serif', label: 'Helvetica' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: '"Times New Roman", Times, serif', label: 'Times' },
  { value: 'Verdana, sans-serif', label: 'Verdana' },
  { value: 'Tahoma, sans-serif', label: 'Tahoma' },
] as const

export const IMAGE_VARIABLE_OPTIONS = [
  'SenderName',
  'FirstName',
  'SaveName',
  'PGCode',
  'Name',
  'Phone',
] as const
