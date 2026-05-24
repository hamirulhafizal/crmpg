export type ImageAspectMode = 'square' | 'fit' | 'original'

export type ImageTextAlign = 'left' | 'center' | 'right'

export type ImageLayerKind = 'variable' | 'static'

export type ImageTextLayer = {
  id: string
  /** variable = customer field; static = fixed text on image */
  layer_kind?: ImageLayerKind
  /** Template token without braces, e.g. SenderName (when layer_kind is variable) */
  variable: string
  /** Fixed text on image (when layer_kind is static) */
  static_text?: string
  /** 0–100 percent of design canvas width */
  x: number
  /** 0–100 percent of design canvas height */
  y: number
  /** Degrees, -180…180 */
  rotation?: number
  /** Visual scale multiplier from canvas resize (1 = 100%) */
  scale?: number
  flip_x?: boolean
  flip_y?: boolean
  font_family: string
  font_size: number
  color: string
  align: ImageTextAlign
  font_weight?: number
  /** Highlight box behind text (hex). */
  text_background_color?: string
  /** 0 = no box; 1–100 = opacity of text_background_color. */
  text_background_opacity?: number
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

export type ImageFontOption = { value: string; label: string }

export type ImageFontGroup = {
  label: string
  options: ImageFontOption[]
}

/** Fonts grouped by style (web-safe stacks for editor + server render). */
export const IMAGE_FONT_GROUPS: ImageFontGroup[] = [
  {
    label: 'Sans serif',
    options: [
      { value: 'Helvetica, Arial, sans-serif', label: 'Helvetica' },
      { value: 'Arial, sans-serif', label: 'Arial' },
      { value: '"Segoe UI", Calibri, Candara, sans-serif', label: 'Calibri' },
      { value: '"Franklin Gothic Medium", "Arial Narrow", Arial, sans-serif', label: 'Franklin Gothic' },
      { value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
      { value: 'Tahoma, Geneva, sans-serif', label: 'Tahoma' },
    ],
  },
  {
    label: 'Serif',
    options: [
      { value: '"Times New Roman", Times, serif', label: 'Times New Roman' },
      { value: 'Georgia, "Times New Roman", serif', label: 'Georgia' },
      { value: 'Baskerville, "Palatino Linotype", Palatino, serif', label: 'Baskerville' },
      { value: '"Trajan Pro", "Times New Roman", Georgia, serif', label: 'Trajan' },
    ],
  },
  {
    label: 'Script',
    options: [
      { value: '"Brush Script MT", "Segoe Script", cursive', label: 'Brush Script' },
      { value: '"Lucida Handwriting", "Apple Chancery", cursive', label: 'Handwriting' },
      { value: '"Segoe Script", "Brush Script MT", cursive', label: 'Edwardian-style script' },
      { value: 'cursive', label: 'Cursive (system)' },
    ],
  },
  {
    label: 'Modern',
    options: [
      { value: 'Futura, "Century Gothic", "Trebuchet MS", sans-serif', label: 'Futura' },
      { value: '"Century Gothic", Futura, sans-serif', label: 'Century Gothic' },
      { value: 'Didot, "Bodoni MT", Georgia, serif', label: 'Didot' },
      { value: '"Century Gothic", "Avant Garde", Avantgarde, sans-serif', label: 'Avant Garde' },
    ],
  },
  {
    label: 'Display',
    options: [
      { value: 'Cooper, "Cooper Std", Georgia, serif', label: 'Cooper' },
      { value: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif', label: 'Impact' },
      { value: '"Comic Sans MS", "Comic Sans", cursive', label: 'Comic / playful' },
      { value: 'Papyrus, fantasy', label: 'Papyrus' },
    ],
  },
]

export const IMAGE_FONT_OPTIONS: ImageFontOption[] = IMAGE_FONT_GROUPS.flatMap((g) => g.options)

export const IMAGE_VARIABLE_OPTIONS = [
  'SenderName',
  'FirstName',
  'SaveName',
  'PGCode',
  'Name',
  'Phone',
] as const
