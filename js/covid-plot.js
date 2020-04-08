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
    .call(xAxis.ticks(6).tickFormat(d3.timeFormat("%m/%d")));
  // Don't use scientific notation for the y-axis and add thousand separators
  svg.append('g')
    .attr('class', 'y axis')
    .call(yAxis.ticks(8, ',.0f'));
  // Grid
  svg.append('g')			
    .attr('class', 'grid')
    .attr('transform', `translate(0,${height})`)
    .call(xAxis
          .ticks(6)
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
  const lines = svg.append('g')
        .attr('class', 'line')
        .selectAll('path')
        .data(data)
        .enter().append('path')
        .style('stroke', (_, i) => color(i))
        .style('stroke-width', '1.5px')
        .on('mouseover', fade(0.3))
        .on('mouseout', fade(1))
        .attr('d', d3.line());
  // State dots
  const dots = svg.append('g')
        .attr('class', 'dot')
        .selectAll('g')
        .data(data)
        .enter().append('g')
        .style('fill', (d, i) => color(i))
        .on('mouseover', fade(0.3))
        .on('mouseout', fade(1));
  dots.each((p, j, p_nodes) =>
            d3.select(p_nodes[j])
            .selectAll('path')
            .data(d => d)
            .enter().append('path')
            .attr('transform', d => `translate(${d[0]},${d[1]})`)
            .attr('d', d3.symbol().size(25).type(d3.symbols[j % d3.symbols.length])));
  function fade(opacity) {
    return (_, j) => {
      lines.transition().duration(200)
        .style('stroke-opacity', (_, i) => i === j ? 1 : opacity);
      dots.transition().duration(200)
        .style('fill-opacity', (_, i) => i === j ? 1 : opacity);
    };
  }
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
    .attr('d', d3.symbol().size(36).type((_, i) => d3.symbols[i % d3.symbols.length]))
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
  const state_data = data.slice(0, 10);
  const min_y = 1;
  const max_x = state_data.reduce((max_x, s) => Math.max(max_x, s[1][s[1].length - 1][0]), 0);
  const margin = {top: 5, right: 15, bottom: 20, left: 50};
  const width = 400;
  const height = 400;
  const keys = [null, 'cases', 'deaths'];
  for (let col = 1; col <= 2; col++) {
    const min_x = state_data.reduce((min_x, s) => {
      const first = s[1].findIndex(d => d[col] > 0);
      return first < 0 ? min_x : Math.min(min_x, s[1][first][0]);
    }, Number.MAX_VALUE);
    const max_y = state_data.reduce((max_y, s) => Math.max(max_y, s[1][s[1].length - 1][col]), 0);
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
    addAxes(svg, xScale, yScale, width, height, col === 1 ? 4 : 3);
    const states = state_data.map(c => c[0]);
    const data2 = state_data.map(c => c[1]
                                 .filter(d => d[col] > 0)
                                 .map(d => [xScale(toDate(d[0])), yScale(d[col])]));
    addDoubling(svg, xScale, yScale, width, height, min_x, max_x, min_y);
    addData(svg, data2, color);
    addLegend(svg, states, keys[col], width, height, color);
  }
}

function getSlope(values) {
  // slope = (n*sum(x*y)-sum(x)*sum(y)) / (n*sum(x^2) - sum(x)^2)
  // x = 0..(n-1)
  // sum(x)=(n-1)*n/2
  // sum(x^2)=(n-1)*n*(2*(n-1)+1)/6 = (n-1)*n*(2*n-1)/6
  const n = values.length;
  const sum_x = (n - 1) * n / 2;
  const sum_x2 = (n - 1) * n * (2 * n - 1) / 6;
  const sum_y = values.reduce((sum, y) => sum + y, 0);
  const sum_xy = values.reduce((sum, y, i) => sum + i * y, 0);
  const slope = (n * sum_xy - sum_x * sum_y) / (n * sum_x2 - sum_x * sum_x);
  return slope;
}

function getGrowths(data) {
  const n = 4;
  return [1, 2].map(i => {
    let values = data.slice(Math.max(0, data.length - n)).map(d => d[i]);
    const idx = values.findIndex(x => x > 0);
    if (idx < 0 || idx === data.length - 1) {
      return '';
    }
    if (idx > 0) {
      values.splice(0, idx);
    }
    return `${(100 * (Math.exp(getSlope(values.map(x => Math.log(x)))) - 1)).toFixed(0)}%`
  });
}

function summarizeData(data) {
  const state_data = data.slice(0, 20);
  const summary = document.getElementById('summary');
  // It's not worth to load React for this small table.
  const table = document.createElement('table');
  summary.appendChild(table);
  const header = document.createElement('tr');
  table.appendChild(header);
  ['', 'Cases', 'Deaths'].forEach(h => {
    const th1 = document.createElement('th');
    th1.appendChild(document.createTextNode(h));
    header.appendChild(th1);
  });
  const th2 = document.createElement('th');
  th2.colSpan = 2;
  th2.appendChild(document.createTextNode('Daily'));
  header.appendChild(th2);
  state_data.forEach(s => {
    const tr = document.createElement('tr');
    table.appendChild(tr);
    const td1 = document.createElement('td');
    td1.appendChild(document.createTextNode(s[0]));
    tr.appendChild(td1);
    for (let i = 1; i <= 2; i++) {
      const td2 = document.createElement('td');
      td2.className = 'right';
      if (i === 2) {
        td2.style.paddingRight = '0.75em';
      }
      td2.appendChild(document.createTextNode(s[1][s[1].length - 1][i].toLocaleString('en-US')));
      tr.appendChild(td2);
    }
    for (const g of getGrowths(s[1])) {
      const td2 = document.createElement('td');
      td2.className = 'right';
      td2.appendChild(document.createTextNode(g));
      tr.appendChild(td2);
    }
  });
}

function processData(data, states) {
  const max_pos = new Map();
  data.forEach(d => {
    if (!max_pos.has(d.state)) {
      max_pos.set(d.state, d.positive);
    }
  });
  let top_states = Array.from(max_pos)
      .sort((a, b) => b[1] - a[1])
      .map(t => t[0]);
  if (states && states.length) {
    const remove = new Set(states);
    states.push(...top_states.filter(t => !remove.has(t)));
  }
  else {
    states = top_states;
  }
  const series_map = new Map(states.map(s => [s, []]));
  data.forEach(d => {
    const series = series_map.get(d.state);
    if (series) {
      // an empty array is truthy
      series.push([d.date, d.positive || 0, d.death || 0]);
    }
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
  const data = processData(await makeXHR({url}), states);
  plotData(data);
  summarizeData(data);
}

loadData((new URL(document.location)).searchParams.get('states'));
