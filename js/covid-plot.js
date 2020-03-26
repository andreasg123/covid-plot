function makeXHR({method='GET', url, data, headers, timeout, responseType='json'}) {
  return new Promise((resolve, reject) => {
    const req = new XMLHttpRequest();
    if (timeout) {
      req.timeout = timeout;
    }
    for (const evt_type of ['load', 'error', 'abort', 'timeout']) {
      req.addEventListener(evt_type, () => {
        if (evt_type === 'load' && req.status === 200) {
          resolve(req.response);
        }
        else {
          const err = new Error(evt_type !== 'load' ? evt_type : `HTTP ${req.status}`);
          err.request = req;
          reject(err);
        }
      });
    }
    req.open(method, url, true);
    for (const h in headers) {
      req.setRequestHeader(h, headers[h]);
    }
    req.responseType = responseType;
    req.send(data);
  });
}

function toDate(d) {
  // Converts a number in the format 20200321 into a Date object.
  // Don't turn d into an ISO string '2020-03-21' because that produces UTC,
  // causing data points not to line up with x-axis marks.
  const day = d % 100;
  d = (d - day) / 100;
  const month = d % 100;
  const year = (d - month) / 100;
  return new Date(year, month - 1, day);
}

function addAxes(svg, xScale, yScale, width, height, grid_ticks) {
  // Axes
  const xAxis = d3.axisBottom(xScale);
  const yAxis = d3.axisLeft(yScale);
  svg.append('g')
    .attr('class', 'x axis')
    .attr('transform', `translate(0,${height})`)
    .call(xAxis.tickFormat(d3.timeFormat("%m/%d")));
  // Don't use scientific notation for the y-axis and add thousand separators
  svg.append('g')
    .attr('class', 'y axis')
    .call(yAxis.ticks(8, ',.0f'));
  // Grid
  svg.append('g')			
    .attr('class', 'grid')
    .attr('transform', `translate(0,${height})`)
    .call(xAxis
          .tickSize(-height)
          .tickFormat(''));
  svg.append('g')			
    .attr('class', 'grid')
    .call(yAxis
          .ticks(grid_ticks)
          .tickSize(-width)
          .tickFormat(''));
}

function addDoubling(svg, xScale, yScale, width, height, min_x, max_x, min_y) {
  // Draw dotted lines indicating doubling in 1-4 days.
  // Round in case of a DST change.
  const days = Math.round((toDate(max_x).getTime() - toDate(min_x).getTime()) /
                          (24 * 3600000));
  // This assumes clipping.
  const doubling = [1, 2, 3, 4]
        .map(d => [[xScale(toDate(min_x)), yScale(min_y)],
                   [xScale(toDate(max_x)), yScale(Math.pow(2, days / d) * min_y)]]);
  svg.append('defs').append('clipPath')
    .attr('id', 'clip')
    .append('rect')
    .attr('width', width)
    .attr('height', height);
  svg.append('g')
    .attr('class', 'dotted')
    .attr('clip-path', 'url(#clip)')
    .selectAll('path')
    .data(doubling)
    .enter().append('path')
    .attr('d', d3.line());
}

function addData(svg, data, color) {
  // State lines
  svg.append('g')
    .attr('class', 'line')
    .selectAll('path')
    .data(data)
    .enter().append('path')
    .style('stroke', (_, i) => color(i))
    .attr('d', d3.line());
  const dots = [];
  data.forEach((c, i) => {
    dots.push(...c.map(d => [i, ...d]));
  });
  // State dots
  svg.append('g')
    .selectAll('.dot')
    .data(dots)
    .enter().append('path')
    .attr('class', 'dot')
    .attr('d', d3.symbol().size(20).type(d => d3.symbols[d[0] % d3.symbols.length]))
    .attr('transform', d => `translate(${d[1]},${d[2]})`)
    .style('fill', d => color(d[0]));
}

function addLegend(svg, states, key, width, height, color) {
  // Legend
  const legend = svg.append('g')
        .attr('class', 'legend')
        .selectAll('g')
        .data(states)
        .enter().append('g')
        .attr('transform', (_, i) =>
              `translate(${width - 40},${height - 15 * (states.length - i)})`);
  legend.append('line')
    .style('stroke', (_, i) => color(i))
    .attr('x2', 20);
  legend.append('path')
    .attr('d', d3.symbol().size(30).type((_, i) => d3.symbols[i % d3.symbols.length]))
    .attr('transform', 'translate(10,0)')
    .style('fill', (_, i) => color(i));
  legend.append('text')
    .attr('dy', '.35em')
    .attr('x', 26)
    .text(d => d);
  svg.append('text')
    .attr('x', 10)
    .attr('y', 12)
    .style('font-size', '12px')
    .text('COVID-19 ' + key);
}

function plotData(data) {
  const min_y = 1;
  const max_x = data.reduce((max_x, s) => Math.max(max_x, s[1][s[1].length - 1][0]), 0);
  const margin = {top: 5, right: 15, bottom: 20, left: 50};
  const width = 400;
  const height = 400;
  const keys = [null, 'cases', 'deaths'];
  for (let col = 1; col <= 2; col++) {
    const min_x = data.reduce((min_x, s) => {
      const first = s[1].findIndex(d => d[col] > 0);
      return first < 0 ? min_x : Math.min(min_x, s[1][first][0]);
    }, Number.MAX_VALUE);
    const max_y = data.reduce((max_y, s) => Math.max(max_y, s[1][s[1].length - 1][col]), 0);
    const svg = d3.select(`#${keys[col]}`)
          .append('svg')
          .attr('width', width + margin.left + margin.right)
          .attr('height', height + margin.top + margin.bottom)
          .append('g')
          .attr('transform', `translate(${margin.left},${margin.top})`);
    const xScale = d3.scaleTime()
          .domain([toDate(min_x), toDate(max_x)])
          .range([0, width]);
    const yScale = d3.scaleLog()
          .domain([min_y, max_y])
          //.nice()
          .range([height, 0]);
    const color = d3.scaleOrdinal(d3.schemeCategory10);
    addAxes(svg, xScale, yScale, width, height, col === 1 ? 4 : 2);
    const states = data.map(c => c[0]);
    const data2 = data.map(c => c[1]
                           .filter(d => d[col] > 0)
                           .map(d => [xScale(toDate(d[0])), yScale(d[col])]));
    addDoubling(svg, xScale, yScale, width, height, min_x, max_x, min_y);
    addData(svg, data2, color);
    addLegend(svg, states, keys[col], width, height, color);
  }
}

function processData(data, states) {
  const max_pos = new Map();
  data.forEach(d => {
    if (!max_pos.has(d.state)) {
      max_pos.set(d.state, d.positive);
    }
  });
  const top = Array.from(max_pos).sort((a, b) => b[1] - a[1])
  const max_count = 10;
  top.length = max_count;
  for (const t of top) {
    if (states.indexOf(t[0]) < 0) {
      states.push(t[0]);
    }
  }
  states.length = Math.min(states.length, max_count);
  const include = new Set(states);
  const series_map = new Map();
  data.forEach(d => {
    if (!include.has(d.state)) {
      return;
    }
    const series = series_map.get(d.state) || [];
    series.push([d.date, d.positive || 0, d.death || 0]);
    series_map.set(d.state, series);
  });
  return states.map(s => [s, series_map.get(s).reverse()]);
}

async function loadData(states) {
  const input = document.querySelector('input[type=text]');
  if (input) {
    input.value = states;
  }
  states = states ? states.toUpperCase().split(/[, ]+/) : [];
  const url = 'https://covidtracking.com/api/states/daily';
  const data = await makeXHR({url});
  plotData(processData(data, states));
}

loadData((new URL(document.location)).searchParams.get('states'));
