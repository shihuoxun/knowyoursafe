export type Lang = 'zh' | 'en'

export const LANG_LABELS: Record<Lang, string> = { zh: '中文', en: 'EN' }

const t = {
  zh: {
    searchPlaceholder: '搜索墨尔本地址…',
    loading: '加载中…',
    clickToScore: '点击地图查看评分',
    clickMapHint: '点击地图选择位置',

    // Community reports (primary)
    reportsTitle: '附近安全举报',
    noReports: '附近暂无举报记录',
    reportCount: (n: number) => `${n} 条举报`,
    filterAll: '全部',
    filterNight: '夜间',
    filterToday: '今天',
    reportCTA: '我要举报',
    shareLocation: '📍 分享我的位置',
    shareCopied: '链接已复制',
    timeAgo: (minutes: number) =>
      minutes < 60 ? `${minutes}分钟前` :
      minutes < 1440 ? `${Math.floor(minutes / 60)}小时前` :
      `${Math.floor(minutes / 1440)}天前`,
    recentBadge: '最新',
    upvote: '属实',
    upvoted: '已确认',
    distance: (m: number) => `${m}m`,

    // Safety score (secondary / collapsed)
    safetyAnalysis: '安全评分（参考）',
    factorTitle: '评分细分',
    scoreNote: '评分基于路灯、人流、设施距离和历史犯罪数据，仅供参考',
    gradeLabel: { A: '区域较安全', B: '基本安全，注意周围', C: '一般，保持警觉', D: '较危险，建议结伴', F: '高风险区域' } as Record<string, string>,
    factors: { lightingScore: '街道照明', footfallScore: '人流密度', facilityScore: '周边设施', crimeScore: '历史犯罪' } as Record<string, string>,

    footfallTitle: '实时人流',
    perMin: '人/小时',
    awayM: (m: number) => `${m}m 外`,
    footfallLevel: { busy: '人多热闹', moderate: '人流适中', quiet: '较为安静', empty: '几乎无人' } as Record<string, string>,
    trend: { rising: '↑ 上升', stable: '→ 稳定', falling: '↓ 减少' } as Record<string, string>,

    nearbyTitle: '附近安全设施',
    reportBtn: '举报安全隐患',
    hidePanel: '◀ 隐藏',
    showPanel: '▶ 面板',

    // Report modal
    reportTitle: '举报安全隐患',
    locationLabel: '位置',
    anonymous: '所有举报完全匿名',
    categoryLabel: '隐患类型 *',
    timeLabel: '发生时间段（可选）',
    timeUnknown: '不确定',
    descLabel: '描述（可选，最多200字）',
    descPlaceholder: '简短描述情况…',
    submitBtn: '提交举报',
    submitting: '提交中…',
    submitError: '提交失败',
    timeOptions: [
      { value: 'morning',   label: '早晨 6–12时' },
      { value: 'afternoon', label: '下午 12–18时' },
      { value: 'evening',   label: '傍晚 18–21时' },
      { value: 'night',     label: '深夜 21–6时' },
    ],
    categories: [
      { value: 'unsafe',        label: '总体不安全',   emoji: '🚨' },
      { value: 'harassment',    label: '骚扰/跟踪',    emoji: '😟' },
      { value: 'poor_lighting', label: '照明不足',     emoji: '🔦' },
      { value: 'isolated',      label: '偏僻/无人',    emoji: '🌑' },
      { value: 'other',         label: '其他安全问题', emoji: '⚠️' },
    ],
    reportPopupTitle: '⚠ 社区举报',
    distAway: (m: number) => `${m}m 以外`,
  },
  en: {
    searchPlaceholder: 'Search Melbourne address…',
    loading: 'Loading…',
    clickToScore: 'Tap map to check safety',
    clickMapHint: 'Tap map to select location',

    // Community reports (primary)
    reportsTitle: 'Nearby safety reports',
    noReports: 'No reports near here',
    reportCount: (n: number) => `${n} report${n !== 1 ? 's' : ''}`,
    filterAll: 'All',
    filterNight: 'Night',
    filterToday: 'Today',
    reportCTA: 'Submit a report',
    shareLocation: '📍 Share my location',
    shareCopied: 'Link copied',
    timeAgo: (minutes: number) =>
      minutes < 60 ? `${minutes}m ago` :
      minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` :
      `${Math.floor(minutes / 1440)}d ago`,
    recentBadge: 'New',
    upvote: 'Confirm',
    upvoted: 'Confirmed',
    distance: (m: number) => `${m}m`,

    // Safety score (secondary / collapsed)
    safetyAnalysis: 'Safety score (reference)',
    factorTitle: 'Score breakdown',
    scoreNote: 'Score based on lighting, foot traffic, nearby facilities and crime history. For guidance only.',
    gradeLabel: { A: 'Generally safe', B: 'Mostly safe, stay aware', C: 'Moderate risk, stay alert', D: 'Higher risk, go with others', F: 'High risk area' } as Record<string, string>,
    factors: { lightingScore: 'Street lighting', footfallScore: 'Foot traffic', facilityScore: 'Nearby facilities', crimeScore: 'Crime history' } as Record<string, string>,

    footfallTitle: 'Live foot traffic',
    perMin: 'people/hr',
    awayM: (m: number) => `${m}m away`,
    footfallLevel: { busy: 'Busy', moderate: 'Moderate', quiet: 'Quiet', empty: 'Very quiet' } as Record<string, string>,
    trend: { rising: '↑ Rising', stable: '→ Stable', falling: '↓ Falling' } as Record<string, string>,

    nearbyTitle: 'Nearby safe places',
    reportBtn: 'Report safety concern',
    hidePanel: '◀ Hide',
    showPanel: '▶ Panel',

    // Report modal
    reportTitle: 'Report Safety Concern',
    locationLabel: 'Location',
    anonymous: 'All reports are fully anonymous',
    categoryLabel: 'Concern type *',
    timeLabel: 'Time of day (optional)',
    timeUnknown: 'Not sure',
    descLabel: 'Description (optional, max 200 chars)',
    descPlaceholder: 'Briefly describe the situation…',
    submitBtn: 'Submit report',
    submitting: 'Submitting…',
    submitError: 'Submission failed',
    timeOptions: [
      { value: 'morning',   label: 'Morning 6am–12pm' },
      { value: 'afternoon', label: 'Afternoon 12–6pm' },
      { value: 'evening',   label: 'Evening 6–9pm' },
      { value: 'night',     label: 'Night 9pm–6am' },
    ],
    categories: [
      { value: 'unsafe',        label: 'Generally unsafe',      emoji: '🚨' },
      { value: 'harassment',    label: 'Harassment / following', emoji: '😟' },
      { value: 'poor_lighting', label: 'Poor lighting',          emoji: '🔦' },
      { value: 'isolated',      label: 'Isolated / no people',   emoji: '🌑' },
      { value: 'other',         label: 'Other safety issue',     emoji: '⚠️' },
    ],
    reportPopupTitle: '⚠ Community report',
    distAway: (m: number) => `${m}m away`,
  },
}

export type Translations = typeof t.zh
export default t
