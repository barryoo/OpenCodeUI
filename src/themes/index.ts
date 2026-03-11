/**
 * 主题系统
 * 
 * 架构说明：
 * - 每个"主题风格"（ThemePreset）包含 light 和 dark 两套配色
 * - 用户选择 主题风格 + 日夜模式（system/light/dark）
 * - 自定义主题通过用户提供的 CSS 覆盖 CSS 变量实现
 * 
 * 颜色格式：HSL 不带 hsl() 包装，如 '210 90% 50%'
 */

// ============================================
// Types
// ============================================

export interface ThemeColors {
  /** 背景色 */
  background: {
    bg050: string
    bg000: string
    bg100: string
    bg200: string
    bg300: string
    bg400: string
  }
  /** 文本色 */
  text: {
    text000: string
    text100: string
    text200: string
    text300: string
    text400: string
    text500: string
    text600: string
  }
  /** 品牌色 */
  accent: {
    brand: string
    main000: string
    main100: string
    main200: string
    secondary100: string
  }
  /** 语义化颜色 */
  semantic: {
    success100: string
    success200: string
    successBg: string
    warning100: string
    warning200: string
    warningBg: string
    danger000: string
    danger100: string
    danger200: string
    dangerBg: string
    danger900: string
    info100: string
    info200: string
    infoBg: string
  }
  /** 边框色 */
  border: {
    border100: string
    border200: string
    border300: string
  }
  /** 特殊色 */
  special?: {
    alwaysBlack?: string
    alwaysWhite?: string
    oncolor100?: string
  }
}

export interface ThemePreset {
  id: string
  name: string
  description: string
  light: ThemeColors
  dark: ThemeColors
}

// ============================================
// Shared Neutral Palette
// ============================================
// 设计原则：
// - 主题切换只改变强调色（accent）
// - 背景、文字、边框、语义色在同一 mode 下保持稳定
// - 避免“整套 UI 被染色”的感觉

type NeutralThemeColors = Omit<ThemeColors, 'accent'>

const neutralLight: NeutralThemeColors = {
  background: {
    bg050: '0 0% 100%',
    bg000: '0 0% 100%',
    bg100: '0 0% 97%',
    bg200: '0 0% 95%',
    bg300: '0 0% 90%',
    bg400: '0 0% 84%',
  },
  text: {
    text000: '0 0% 100%',
    text100: '220 10% 12%',
    text200: '220 8% 22%',
    text300: '220 6% 34%',
    text400: '220 5% 46%',
    text500: '220 5% 58%',
    text600: '220 6% 72%',
  },
  semantic: {
    success100: '146 65% 38%',
    success200: '146 70% 32%',
    successBg: '146 65% 92%',
    warning100: '36 90% 42%',
    warning200: '32 85% 36%',
    warningBg: '42 88% 92%',
    danger000: '2 62% 36%',
    danger100: '2 74% 48%',
    danger200: '2 82% 58%',
    dangerBg: '2 82% 93%',
    danger900: '2 62% 88%',
    info100: '208 72% 46%',
    info200: '208 70% 56%',
    infoBg: '208 78% 92%',
  },
  border: {
    border100: '220 8% 88%',
    border200: '220 7% 82%',
    border300: '220 6% 72%',
  },
  special: {
    alwaysBlack: '0 0% 0%',
    alwaysWhite: '0 0% 100%',
    oncolor100: '0 0% 100%',
  },
}

const neutralDark: NeutralThemeColors = {
  background: {
    bg050: '203 18% 25%',
    bg000: '206 18% 21%',
    bg100: '210 18% 15%',
    bg200: '212 18% 11%',
    bg300: '214 18% 8%',
    bg400: '216 20% 6%',
  },
  text: {
    text000: '0 0% 100%',
    text100: '200 20% 94%',
    text200: '200 16% 84%',
    text300: '202 12% 74%',
    text400: '204 10% 64%',
    text500: '206 9% 54%',
    text600: '208 8% 44%',
  },
  semantic: {
    success100: '146 62% 58%',
    success200: '146 68% 66%',
    successBg: '146 48% 22%',
    warning100: '38 92% 62%',
    warning200: '38 95% 70%',
    warningBg: '38 50% 22%',
    danger000: '4 78% 66%',
    danger100: '4 85% 72%',
    danger200: '4 92% 78%',
    dangerBg: '4 52% 22%',
    danger900: '4 40% 28%',
    info100: '208 78% 68%',
    info200: '208 80% 76%',
    infoBg: '208 50% 22%',
  },
  border: {
    border100: '210 14% 28%',
    border200: '210 14% 34%',
    border300: '210 14% 42%',
  },
  special: {
    alwaysBlack: '0 0% 0%',
    alwaysWhite: '0 0% 100%',
    oncolor100: '0 0% 100%',
  },
}

function withAccent(neutral: NeutralThemeColors, accent: ThemeColors['accent']): ThemeColors {
  return {
    background: { ...neutral.background },
    text: { ...neutral.text },
    accent,
    semantic: { ...neutral.semantic },
    border: { ...neutral.border },
    special: neutral.special ? { ...neutral.special } : undefined,
  }
}

// ============================================
// Eucalyptus 主题（默认）
// ============================================

const eucalyptusLight: ThemeColors = withAccent(neutralLight, {
  brand: '165 55% 40%',
  main000: '165 58% 34%',
  main100: '165 60% 42%',
  main200: '165 65% 48%',
  secondary100: '204 58% 50%',
})

const eucalyptusDark: ThemeColors = withAccent(neutralDark, {
  brand: '165 62% 58%',
  main000: '165 58% 50%',
  main100: '165 62% 58%',
  main200: '165 68% 66%',
  secondary100: '204 65% 66%',
})

export const eucalyptusTheme: ThemePreset = {
  id: 'eucalyptus',
  name: 'Eucalyptus',
  description: 'Neutral UI with eucalyptus accent',
  light: eucalyptusLight,
  dark: eucalyptusDark,
}

// 默认主题 ID
export const DEFAULT_THEME_ID = 'eucalyptus'

// ============================================
// Claude 主题
// ============================================

const claudeLight: ThemeColors = withAccent(neutralLight, {
  brand: '24 90% 50%',
  main000: '24 85% 45%',
  main100: '24 90% 50%',
  main200: '24 95% 55%',
  secondary100: '210 85% 50%',
})

const claudeDark: ThemeColors = withAccent(neutralDark, {
  brand: '24 70% 55%',
  main000: '24 75% 50%',
  main100: '24 80% 58%',
  main200: '24 85% 62%',
  secondary100: '210 80% 60%',
})

export const claudeTheme: ThemePreset = {
  id: 'claude',
  name: 'Claude',
  description: 'Neutral UI with warm orange accent',
  light: claudeLight,
  dark: claudeDark,
}

// ============================================
// Breeze 主题
// ============================================

const breezeLight: ThemeColors = withAccent(neutralLight, {
  brand: '187 72% 42%',
  main000: '187 68% 36%',
  main100: '187 72% 42%',
  main200: '187 75% 48%',
  secondary100: '230 65% 55%',
})

const breezeDark: ThemeColors = withAccent(neutralDark, {
  brand: '187 65% 52%',
  main000: '187 60% 46%',
  main100: '187 65% 52%',
  main200: '187 68% 58%',
  secondary100: '230 60% 62%',
})

export const breezeTheme: ThemePreset = {
  id: 'breeze',
  name: 'Breeze',
  description: 'Neutral UI with cool teal accent',
  light: breezeLight,
  dark: breezeDark,
}

// ============================================
// Theme Registry
// ============================================

export const builtinThemes: ThemePreset[] = [
  eucalyptusTheme,
  claudeTheme,
  breezeTheme,
]

export function getThemePreset(id: string): ThemePreset | undefined {
  return builtinThemes.find(t => t.id === id)
}

/**
 * 将 ThemeColors 转换为 CSS 变量赋值字符串
 */
export function themeColorsToCSSVars(theme: ThemeColors): string {
  const lines: string[] = []
  
  // Background
  lines.push(`--bg-050: ${theme.background.bg050};`)
  lines.push(`--bg-000: ${theme.background.bg000};`)
  lines.push(`--bg-100: ${theme.background.bg100};`)
  lines.push(`--bg-200: ${theme.background.bg200};`)
  lines.push(`--bg-300: ${theme.background.bg300};`)
  lines.push(`--bg-400: ${theme.background.bg400};`)
  
  // Text
  lines.push(`--text-000: ${theme.text.text000};`)
  lines.push(`--text-100: ${theme.text.text100};`)
  lines.push(`--text-200: ${theme.text.text200};`)
  lines.push(`--text-300: ${theme.text.text300};`)
  lines.push(`--text-400: ${theme.text.text400};`)
  lines.push(`--text-500: ${theme.text.text500};`)
  lines.push(`--text-600: ${theme.text.text600};`)
  
  // Accent
  lines.push(`--accent-brand: ${theme.accent.brand};`)
  lines.push(`--accent-main-000: ${theme.accent.main000};`)
  lines.push(`--accent-main-100: ${theme.accent.main100};`)
  lines.push(`--accent-main-200: ${theme.accent.main200};`)
  lines.push(`--accent-secondary-100: ${theme.accent.secondary100};`)
  
  // Semantic
  lines.push(`--success-100: ${theme.semantic.success100};`)
  lines.push(`--success-200: ${theme.semantic.success200};`)
  lines.push(`--success-bg: ${theme.semantic.successBg};`)
  lines.push(`--warning-100: ${theme.semantic.warning100};`)
  lines.push(`--warning-200: ${theme.semantic.warning200};`)
  lines.push(`--warning-bg: ${theme.semantic.warningBg};`)
  lines.push(`--danger-000: ${theme.semantic.danger000};`)
  lines.push(`--danger-100: ${theme.semantic.danger100};`)
  lines.push(`--danger-200: ${theme.semantic.danger200};`)
  lines.push(`--danger-bg: ${theme.semantic.dangerBg};`)
  lines.push(`--danger-900: ${theme.semantic.danger900};`)
  lines.push(`--info-100: ${theme.semantic.info100};`)
  lines.push(`--info-200: ${theme.semantic.info200};`)
  lines.push(`--info-bg: ${theme.semantic.infoBg};`)
  
  // Border
  lines.push(`--border-100: ${theme.border.border100};`)
  lines.push(`--border-200: ${theme.border.border200};`)
  lines.push(`--border-300: ${theme.border.border300};`)
  
  // Special
  if (theme.special) {
    if (theme.special.alwaysBlack) lines.push(`--always-black: ${theme.special.alwaysBlack};`)
    if (theme.special.alwaysWhite) lines.push(`--always-white: ${theme.special.alwaysWhite};`)
    if (theme.special.oncolor100) lines.push(`--oncolor-100: ${theme.special.oncolor100};`)
  }
  
  return lines.join('\n  ')
}
