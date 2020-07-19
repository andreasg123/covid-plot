import {population} from './population.js';
import {toDate} from './utils.js';

var div = d3.select("body").append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);

function addAxes(svg, xScale, yScale, width, height) {
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
    .call(yAxis.ticks(5, ',.0f'));
  svg.append('g')
    .attr('class', 'grid')
    .call(yAxis
          .ticks(5)
          .tickSize(-width)
          .tickFormat(''));
}

function formatCases(cases) {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
    useGrouping: true
  }).format(cases);
}

function plotData(data, same_scale) {
  console.log(data);
  const margin = {top: 20, right: 20, bottom: 70, left: 45}
  const width = 800 - margin.left - margin.right;
  const height = 300 - margin.top - margin.bottom;
  const overall_max_y = same_scale &&
        Math.ceil(Math.max(...data.map(([_, sd]) => Math.max(...sd.map(x => x.positive)))));
  for (const [state, sd] of data) {
    console.log(state, sd);
    const min_x = sd[0].date;
    const max_x = sd[sd.length - 1].date;
    const max_y = same_scale ? overall_max_y : Math.ceil(Math.max(...sd.map(x => x.positive)));
    const svg = d3.select('.container')
          .append('svg')
          .attr('width', width + margin.left + margin.right)
          .attr('height', height + margin.top + margin.bottom)
          .append('g')
          .attr('transform', `translate(${margin.left},${margin.top})`);
    const xScale = d3.scaleTime()
          .domain([toDate(min_x), toDate(max_x)])
          .range([0, width]);
    const yScale = d3.scaleLinear()
          .domain([0, max_y])
          .nice()
          .range([height, 0]);
    addAxes(svg, xScale, yScale, width, height);
    const bar_width = 0.8 * width / sd.length;
    svg.selectAll("bar")
      .data(sd.map(d => [toDate(d.date), d.positive]))
      .enter().append("rect")
      .style("fill", "steelblue")
      .attr("x", d => xScale(d[0]))
      .attr("width", bar_width)
      .attr("y", d => yScale(d[1]))
      .attr("height", d => height - yScale(d[1]))

      // tooltip handler
      .on("mouseover", function(d) {
        div.transition()
            .duration(200)
            .style("opacity", .9);
        div.html(formatCases(d[1]) + ' cases<br/>' + d3.timeFormat('%m/%d')(d[0]))
            .style("left", (d3.event.pageX) + "px")
            .style("top", (d3.event.pageY - 28) + "px");
        })
      .on('mousemove', function (d) {
        div.style("left", (d3.event.pageX) + "px")
          .style("top", (d3.event.pageY - 28) + "px");
      })
      .on("mouseout", function(d) {
          div.transition()
              .duration(500)
              .style("opacity", 0);
    });

    svg.append('g')
      .attr('class', 'line')
      .selectAll('path')
      .data([sd.map(d => [xScale(toDate(d.date)) + 0.5 * bar_width,
                          yScale(d.mean_positive)])])
      .enter().append('path')
      .style('stroke', 'darkblue')
      .style('stroke-width', '1.5px')
      .attr('d', d3.line());
    svg.append('text')
      .attr('x', 10)
      .attr('y', 12)
      .style('font-size', '16px')
      .text(state);
    console.log(svg);
  }
}

function processData(data, states, normalize) {
  const state_map = new Map();
  data.forEach(d => {
    let s = state_map.get(d.state);
    if (!s) {
      s = [];
      state_map.set(d.state, s);
    }
    const factor = normalize ? 100000 / population[d.state] : 1;
    s.push({date: d.date, positive: d.positive * factor, death: d.death * factor});
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
      sum_positive += v[i].positive;
      sum_death += v[i].death;
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
  const top_states = Array.from(max_pos)
      .sort((a, b) => b[1] - a[1])
      .map(t => t[0]);
  if (states && states.length) {
    const remove = new Set(states);
    states.push(...top_states.filter(t => !remove.has(t)));
  }
  else {
    states = top_states;
  }
  return states.map(s => [s, state_map.get(s)]);
}

async function loadData(states, normalize, same_scale) {
  const input = document.querySelector('input[type=text]');
  input.value = states;
  let cb = document.getElementById('normalize');
  cb.checked = normalize;
  cb = document.getElementById('scale');
  cb.checked = same_scale;
  states = states ? states.toUpperCase().split(/[, ]+/) : [];
  const url = 'https://covidtracking.com/api/states/daily';
  const res = await fetch(url);
  const json = await res.json();
  let data = processData(json, states, normalize);
  data = data.slice(0, 10);
  plotData(data, same_scale);
}

const params = (new URL(document.location)).searchParams;
loadData(params.get('states'), params.get('normalize') === 'true',
         params.get('scale') === 'same');
