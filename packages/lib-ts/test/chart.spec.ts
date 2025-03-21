import { generateExecutionGraphQuickchart, generateGanttChartQuickchart, GraphItem, TimeSpan } from '../src/chart';

describe('Chart Generation Tests', () => {
  describe('generateExecutionGraphQuickchart', () => {
    it('should generate correct quickchart URL for simple graph items', () => {
      const items: GraphItem[] = [
        { descriptor: '"A"', label: 'Node A' },
        { descriptor: '"B"', label: 'Node B' },
        { descriptor: '"A" -> "B"' },
      ];

      const url = generateExecutionGraphQuickchart(items);

      expect(url).toContain('https://quickchart.io/graphviz');
      expect(url).toContain(encodeURIComponent('digraph G {'));
      expect(url).toContain(encodeURIComponent('"A" [label="Node A"]'));
      expect(url).toContain(encodeURIComponent('"B" [label="Node B"]'));
      expect(url).toContain(encodeURIComponent('"A" -> "B"'));
    });

    it('should handle items without labels', () => {
      const items: GraphItem[] = [{ descriptor: '"A"' }, { descriptor: '"B"' }];

      const url = generateExecutionGraphQuickchart(items);

      expect(url).toContain('https://quickchart.io/graphviz');
      expect(url).toContain(encodeURIComponent('digraph G {'));
      expect(url).toContain(encodeURIComponent('"A";'));
      expect(url).toContain(encodeURIComponent('"B";'));
    });
  });

  describe('generateGanttChartQuickchart', () => {
    const timeSpans: TimeSpan[] = [
      { key: 'Task 1', startTs: 0, endTs: 100 },
      { key: 'Task 2', startTs: 50, endTs: 150 },
    ];

    it('should generate chart URL with default parameters', () => {
      const url = generateGanttChartQuickchart(timeSpans);

      expect(url).toContain('https://quickchart.io/chart');
      expect(url).toContain('w=500'); // default width
      expect(url).toContain('h=300'); // default height

      const decodedConfig = JSON.parse(decodeURIComponent(url.split('c=')[1].split('&')[0]));
      expect(decodedConfig.type).toBe('horizontalBar');
      expect(decodedConfig.data.labels).toHaveLength(2);
      expect(decodedConfig.data.datasets[0].data).toHaveLength(2);
    });

    it('should respect custom parameters', () => {
      const url = generateGanttChartQuickchart(timeSpans, {
        unit: 's',
        minWidth: 800,
        minHeight: 600,
      });

      expect(url).toContain('w=800');
      expect(url).toContain('h=600');

      const decodedConfig = JSON.parse(decodeURIComponent(url.split('c=')[1].split('&')[0]));
      expect(decodedConfig.data.labels[0]).toContain('s'); // Check if unit is seconds
    });
  });
});
