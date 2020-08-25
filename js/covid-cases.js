import {us_population, ca_population} from './population.js';
import {toDate} from './utils.js';

const e = React.createElement;
const Plot = createPlotlyComponent.default(Plotly);

function selectBestStates(states, sorted_states, data, scale_map, key) {
  const pat = california ? / *, */ : /[, ]+/;
  const values = states ? states.trim().toUpperCase().split(pat) : [];
  const filtered = [];
  for (const v of values) {
    // Binary search for prefix
    let left = 0;
    let right = sorted_states.length - 1;
    while (left <= right) {
      const center = Math.floor(0.5 * (left + right));
      if (v < sorted_states[center][0]) {
        right = center - 1;
      }
      else if (v > sorted_states[center][0]) {
        left = center + 1;
      }
      else {
        left = center;
        break;
      }
    }
    if (left < sorted_states.length && sorted_states[left][0].startsWith(v) &&
        (left === sorted_states.length || !sorted_states[left + 1][0].startsWith(v)) &&
        !filtered.includes(sorted_states[left][1])) {
      filtered.push(sorted_states[left][1]);
    }
  }
  if (filtered.length < 10) {
    const sorted = Array.from(data.entries())
          .map(([k, v]) => [k, v[v.length - 1][key] * scale_map.get(k)])
          .sort((a, b) => b[1] - a[1]);
    for (const [k, v] of sorted) {
      if (!filtered.includes(k)) {
        filtered.push(k);
        if (filtered.length >= 10) {
          break;
        }
      }
    }
  }
  return filtered;
}

function sortStates(data) {
  const sorted = Array.from(data.keys())
        .map(s => [s.toUpperCase(), s])
        .sort((a, b) => a[0].localeCompare(b[0]));
  return sorted;
}

function DataController(props) {
  const [states, setStates] = React.useState(props.states);
  const [deaths, setDeaths] = React.useState(props.normalize);
  const [normalize, setNormalize] = React.useState(props.normalize);
  const [same, setSame] = React.useState(props.same_scale);
  const onChangeStates = evt => {
    setStates(evt.target.value);
  };
  const onChangeDeaths = evt => {
    setDeaths(evt.target.checked);
  };
  const onChangeNormalize = evt => {
    setNormalize(evt.target.checked);
  };
  const onChangeSame = evt => {
    setSame(evt.target.checked);
  };
  const onSubmit = evt => {
    evt.preventDefault();
  };
  const data = props.data || new Map();
  const population = california ? ca_population : us_population;
  // Checking "data.size" is sufficient because the data is only retrieved once.
  const scale_map = React.useMemo(() => {
    return new Map(Array.from(data.keys()).map(
      s => [s, normalize ? 100000 / population[s] : 1]));
  }, [data.size, normalize]);
  const sorted_states = React.useMemo(() => sortStates(data), [data.size]);
  const key1 = deaths ? 'death' : 'positive';
  const key2 = 'mean_' + key1;
  const prev = React.useRef({same, deaths});
  // Keep track of previous traces to maintain "==="
  const traces = React.useRef(new Map());
  if (deaths !== prev.current.deaths || normalize !== prev.current.normalize) {
    traces.current.clear();
    prev.current.deaths = deaths;
    prev.current.normalize = normalize;
  }
  const selected = React.useMemo(() => {
    const selected = selectBestStates(states, sorted_states, data, scale_map, key2);
    for (const s of selected) {
      const scale = scale_map.get(s);
      const series = data.get(s);
      const x = series.map(d => toDate(d.date));
      const y = series.map(d => d[key1] * scale);
      const y2 = series.map(d => d[key2] * scale);
      const prev = traces.current.get(s);
      const len = y.length;
      if (!prev || prev[0].y.length !== len || prev[0].y[len - 1] !== y[len - 1]) {
        const hovertemplate = normalize ? '%{y:.1f}' : '%{y:.0f}';
        traces.current.set(s, [{
          type: 'bar', name: 'daily', x, y, showlegend: false, hovertemplate
        }, {
          type: 'line', name: '7-day', x, y: y2, showlegend: false,
          hovertemplate: '%{y:.1f}', line: {color: 'darkblue'}
        }]);
      }
    }
    return selected;
  }, [states, deaths, normalize, data.size]);
  const overall_max_y = same &&
        Math.max(...selected.map(s => {
          const scale = scale_map.get(s);
          const series = data.get(s);
          return Math.max(...series.map(d => d[key1] * scale));
        }));
  const layout = React.useRef(new Map());
  if (same !== prev.current.same) {
    layout.current.clear();
    prev.current.same = same;
  }
  for (const s of selected) {
    let lyt = layout.current.get(s);
    if (!lyt) {
      lyt = {
        autosize: true,
        title: {
          text: s,
          xref: 'paper',
          yref: 'paper',
          x: 0,
          y: 1,
          xanchor: 'left',
          yanchor: 'top',
          pad: {l: 10, t: 0}
        },
        margin: {
          l: 40,
          r: 10,
          b: 30,
          t: 10,
          pad: 5
        }
      };
      layout.current.set(s, lyt);
    }
    if (same) {
      lyt.yaxis = {range: [0, overall_max_y]};
    }
  }
  const style = React.useMemo(() => ({width: '100%', height: '300px', marginTop: '16px'}), []);
  const config = React.useMemo(() => ({displayModeBar: false}), []);
  const plots = selected.map(s => e(Plot, {
    key: s,
    data: traces.current.get(s),
    layout: layout.current.get(s),
    style,
    useResizeHandler: true,
    config
  }));
  return e(React.Fragment, {},
           e('form', {onSubmit},
             e('label', {},
               e('b', {}, california ? 'Counties:' : 'States:'),
               ' ',
               e('input', {type: 'text', 'name': 'states',
                           'value': states, onChange: onChangeStates})),
             '\u00a0 ',
             e('label', {},
               'deaths',
               e('input', {type: 'checkbox', checked: deaths,
                           onChange: onChangeDeaths})),
             '\u00a0 ',
             e('label', {},
               'per 100,000',
               e('input', {type: 'checkbox', checked: normalize,
                           onChange: onChangeNormalize})),
             '\u00a0 ',
             e('label', {},
               'same scale',
               e('input', {type: 'checkbox', checked: same,
                           onChange: onChangeSame})),
             '\u00a0\u00a0 Plus the ',
             california ? 'counties' : 'states',
             ' with the most cases/deaths'),
           ...(plots.length ? plots : [e('p', {}, 'Loading...')]));
}

function renderData(props) {
  ReactDOM.render(e(DataController, props), document.getElementById('container'));
}

function processData(data) {
  const state_map = new Map();
  data.forEach(d => {
    let s = state_map.get(d.state);
    if (!s) {
      s = [];
      state_map.set(d.state, s);
    }
    s.push(d);
  });
  const max_pos = new Map();
  const n = 7;
  for (const [k, v] of state_map) {
    v.reverse();
    for (let i = v.length - 1; i > 0; i--) {
      v[i].death -= v[i - 1].death;
      v[i].positive -= v[i - 1].positive;
    }
    let sum_positive = 0;
    let sum_death = 0;
    for (let i = 0; i < Math.min(n, v.length); i++) {
      sum_positive += v[i].positive || 0;
      sum_death += v[i].death || 0;
      v[i].mean_positive = sum_positive / (i + 1);
      v[i].mean_death = sum_death / (i + 1);
    }
    for (let i = n; i < v.length; i++) {
      sum_positive += v[i].positive - v[i - n].positive;
      sum_death += v[i].death - v[i - n].death;
      v[i].mean_positive = sum_positive / n;
      v[i].mean_death = sum_death / n;
    }
    max_pos.set(k, v[v.length - 1].mean_positive);
  }
  return state_map;
}

async function loadData(props) {
  // https://covidtracking.com/data/api
  const url = california ?
        'https://data.ca.gov/dataset/covid-19-cases/resource/926fd08f-cc91-4828-af38-bd45de97f8c3/download/statewide_cases.csv' :
        'https://api.covidtracking.com/v1/states/daily.json';
  const res = await fetch(url);
  let json;
  if (california) {
    const text = await res.text();
    const lines = text.split(/\r?\n/);
    if (!lines[lines.length - 1]) {
      lines.pop();
    }
    lines.shift();
    lines.reverse();
    json = lines.map(x => {
      const v = x.split(',');
      return {state: v[0], positive: Number(v[1]), death: Number(v[2]),
              date: Number(v[5].replace(/-/g, ''))};
    });
  }
  else {
    json = await res.json();
  }
  const data = processData(json);
  renderData({...props, data});
}

const params = (new URL(document.location)).searchParams;
const props = {
  states: params.get('states') || '',
  deaths: params.get('deaths') === 'true',
  normalize: params.get('normalize') === 'true',
  same_scale: params.get('scale') === 'same'
};
renderData(props);
loadData(props);
