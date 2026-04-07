import * as echarts from 'echarts/core';
import { useTheme } from 'next-themes';

const COLORS = ['#9A48EA', '#6366F1', '#3B82F6', '#22C55E', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4'];

const lightTheme = {
  color: COLORS,
  backgroundColor: 'transparent',
  textStyle: { fontFamily: 'DM Sans, sans-serif', color: '#71717A' },
  title: { textStyle: { color: '#09090B', fontFamily: 'Sora, sans-serif', fontWeight: 600 } },
  legend: { textStyle: { color: '#71717A' } },
  tooltip: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E4E4E7',
    textStyle: { color: '#09090B' },
    borderWidth: 1,
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: '#E4E4E7' } },
    axisTick: { lineStyle: { color: '#E4E4E7' } },
    axisLabel: { color: '#71717A' },
    splitLine: { lineStyle: { color: '#F4F4F5' } },
  },
  valueAxis: {
    axisLine: { lineStyle: { color: '#E4E4E7' } },
    axisTick: { lineStyle: { color: '#E4E4E7' } },
    axisLabel: { color: '#71717A' },
    splitLine: { lineStyle: { color: '#F4F4F5' } },
  },
};

const darkTheme = {
  color: COLORS,
  backgroundColor: 'transparent',
  textStyle: { fontFamily: 'DM Sans, sans-serif', color: '#71717A' },
  title: { textStyle: { color: '#FAFAFA', fontFamily: 'Sora, sans-serif', fontWeight: 600 } },
  legend: { textStyle: { color: '#A1A1AA' } },
  tooltip: {
    backgroundColor: '#1C1C22',
    borderColor: '#27272A',
    textStyle: { color: '#FAFAFA' },
    borderWidth: 1,
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: '#27272A' } },
    axisTick: { lineStyle: { color: '#27272A' } },
    axisLabel: { color: '#71717A' },
    splitLine: { lineStyle: { color: '#1C1C22' } },
  },
  valueAxis: {
    axisLine: { lineStyle: { color: '#27272A' } },
    axisTick: { lineStyle: { color: '#27272A' } },
    axisLabel: { color: '#71717A' },
    splitLine: { lineStyle: { color: '#1C1C22' } },
  },
};

// Register themes once
echarts.registerTheme('tasksludus', lightTheme);
echarts.registerTheme('tasksludus-dark', darkTheme);

export { COLORS };

/**
 * Returns the ECharts theme name based on current app theme.
 * Usage: const echartsTheme = useEChartsTheme();
 * Then: <ReactECharts theme={echartsTheme} ... />
 */
export function useEChartsTheme() {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === 'dark' ? 'tasksludus-dark' : 'tasksludus';
}
