"""Synthetic geometry regression; never runs the report generator or writes HTML."""
import sys
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET
import math

sys.path.insert(0, str(Path(sys.argv.pop(1)).resolve()) if len(sys.argv) > 1 else str(Path(__file__).resolve().parents[1] / 'tools/report-chart-repair'))
import charts as c

def rectangles(svg):
    root = ET.fromstring(svg)
    return [e for e in root.iter() if e.tag.rsplit('}', 1)[-1] == 'rect' and e.get('fill') == 'red']

class ChartRegression(unittest.TestCase):
    def finite(self, svg):
        root = ET.fromstring(svg)
        for e in root.iter():
            for k in ('x','y','x1','x2','y1','y2','width','height','cx','cy','r'):
                if k in e.attrib:
                    value = float(e.attrib[k]); self.assertTrue(math.isfinite(value))
                    if k in ('width','height','r'): self.assertGreaterEqual(value, 0)
        return root

    def test_constant_line_and_single_value(self):
        for values in ([0,0], [5,5], [-3,-3], [7]):
            with self.subTest(values=values):
                self.finite(c.line_chart([{'values':values,'color':'red'}],['x']*len(values),area=False))
        self.finite(c.line_chart([{'values':[5,6],'color':'red'}],['a','b'],ymin=0,area=False))

    def test_bar_height_sign_and_ratio(self):
        for values in ([-20,-10], [20,10], [-20,10], [-0.02,0.01]):
            with self.subTest(values=values):
                s=c.grouped_bars(['a','b'],[{'values':values,'color':'red'}],value_labels=False)
                self.finite(s); a,b=rectangles(s)
                self.assertAlmostEqual(float(a.get('height')),2*float(b.get('height')),delta=0.15)
                if values[0]*values[1] < 0:
                    self.assertAlmostEqual(float(a.get('y')),float(b.get('y'))+float(b.get('height')),delta=0.15)

    def test_zeros_are_not_fabricated_bars(self):
        self.assertTrue(all(float(r.get('height'))==0 for r in rectangles(c.grouped_bars(['a','b'],[{'values':[0,0],'color':'red'}]))))
        self.assertTrue(all(float(r.get('height'))==0 for r in rectangles(c.column_chart([0,0],['a','b'],colors=['red','red']))))
        rank=c.hbar_rank([{'label':'a','value':0,'color':'red'}]);self.finite(rank)
        self.assertEqual(float(rectangles(rank)[0].get('width')),0)

    def test_empty_data_across_chart_types(self):
        for run in (lambda:c.line_chart([],[]),lambda:c.column_chart([],[]),lambda:c.grouped_bars([],[]),lambda:c.hbar_rank([]),lambda:c.scatter([]),lambda:c.waterfall([]),lambda:c.funnel([]),lambda:c.dumbbell([]),lambda:c.sparkline([]),lambda:c.donut([])):
            with self.subTest(chart=run):
                result=run();self.assertIn('暂无数据',result);self.finite(result)

    def test_adjacent_zero_and_single_point_cases(self):
        for result in (c.waterfall([{'label':'a','value':0}]),c.funnel([{'label':'a','value':0,'note':'0'}]),c.dumbbell([{'label':'a','a':0,'b':0}]),c.dumbbell([{'label':'a','a':-5,'b':-5}]),c.sparkline([3]),c.donut([{'value':0,'color':'red'}])):
            self.finite(result)

    def test_invalid_inputs_fail_explicitly(self):
        for run in (lambda:c.grouped_bars(['a'],[{'values':[1,2],'color':'red'}]),lambda:c.column_chart([1],[]),lambda:c.line_chart([{'values':[1],'color':'red'}],[]),lambda:c.scatter([{'x':0,'y':1,'label':'a'}]),lambda:c.donut([{'value':-1,'color':'red'}]),lambda:c.funnel([{'value':0},{'value':1}]),lambda:c.hbar_rank([{'value':float('nan') }])):
            with self.subTest(chart=run),self.assertRaises(ValueError):run()

    def test_provided_rank_text_does_not_evaluate_unused_formatter(self):
        self.finite(c.hbar_rank([{'label':'a','value':0,'text':'zero'}],fmtv=lambda _:1/0))

unittest.main()
