'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';

interface City {
  name: string;
  coords: [number, number];
  role: string;
  country: string;
}

interface M2Data {
  value: number;
  change: number;
  trend: string;
}

interface Flow {
  from: string;
  to: string;
  fromCountry: string;
  toCountry: string;
  amount: number;
  intensity: number;
  fromM2Change: number;
  toM2Change: number;
  volume: string;
  curveDirection: number;
}

const WorldMap = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const { theme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && (theme === 'dark' || resolvedTheme === 'dark');

  useEffect(() => {
    if (!svgRef.current || !mounted) return;

    // 색상 정의
    const countryColors: Record<string, string> = {
      "USA": "#f56565",
      "UK": "#f59e42",
      "EU": "#48bb78",
      "China": "#ecc94b",
      "Japan": "#4299e1",
      "Korea": "#9f7aea"
    };

    const countryColorsDark: Record<string, string> = {
      "USA": "#fc8181",
      "UK": "#fbb360",
      "EU": "#68d391",
      "China": "#f6e05e",
      "Japan": "#63b3ed",
      "Korea": "#b794f4"
    };

    // 현재 색상 가져오기
    const getCurrentColors = () => isDark ? countryColorsDark : countryColors;

    // 도시 데이터
    const cities: City[] = [
      { name: "New York", coords: [-74.006, 40.7128], role: "Federal Reserve", country: "USA" },
      { name: "London", coords: [-0.1276, 51.5074], role: "Bank of England", country: "UK" },
      { name: "Frankfurt", coords: [8.6821, 50.1109], role: "ECB", country: "EU" },
      { name: "Beijing", coords: [116.4074, 39.9042], role: "PBOC", country: "China" },
      { name: "Tokyo", coords: [139.6917, 35.6895], role: "Bank of Japan", country: "Japan" },
      { name: "Seoul", coords: [126.9780, 37.5665], role: "Bank of Korea", country: "Korea" }
    ];

    // M2 데이터 (Mock)
    const m2Data: Record<string, M2Data> = {
      "USA": { value: 2850, change: 5.2, trend: "increasing" },
      "UK": { value: 520, change: 3.8, trend: "stable" },
      "EU": { value: 1420, change: 4.1, trend: "increasing" },
      "China": { value: 3650, change: 8.5, trend: "increasing" },
      "Japan": { value: 1180, change: 2.1, trend: "stable" },
      "Korea": { value: 385, change: 6.3, trend: "increasing" }
    };

    // 자금 흐름 페어
    const flowPairs = [
      { from: "New York", to: "London" },
      { from: "New York", to: "Tokyo" },
      { from: "London", to: "Frankfurt" },
      { from: "Beijing", to: "Seoul" },
      { from: "Tokyo", to: "Seoul" },
      { from: "Seoul", to: "Tokyo" },
      { from: "London", to: "New York" }
    ];

    // 자금 흐름 계산
    const calculateFlows = (): Flow[] => {
      const flows: Flow[] = [];
      const pathMap = new Map<string, boolean>();

      flowPairs.forEach(pair => {
        const fromCity = cities.find(c => c.name === pair.from);
        const toCity = cities.find(c => c.name === pair.to);

        if (!fromCity || !toCity) return;

        const fromM2 = m2Data[fromCity.country];
        const toM2 = m2Data[toCity.country];

        const intensityDiff = Math.abs(fromM2.change - toM2.change);
        const estimatedAmount = (fromM2.value * intensityDiff / 100);
        const volume = estimatedAmount > 100 ? "High" : estimatedAmount > 50 ? "Medium" : "Low";

        // 겹침 방지
        const pathKey1 = `${pair.from}-${pair.to}`;
        const pathKey2 = `${pair.to}-${pair.from}`;
        let curveDirection = 1;

        if (pathMap.has(pathKey2)) {
          curveDirection = -1;
        }
        pathMap.set(pathKey1, true);

        flows.push({
          from: pair.from,
          to: pair.to,
          fromCountry: fromCity.country,
          toCountry: toCity.country,
          amount: estimatedAmount,
          intensity: intensityDiff,
          fromM2Change: fromM2.change,
          toM2Change: toM2.change,
          volume,
          curveDirection
        });
      });

      return flows;
    };

    const flows = calculateFlows();

    // 지도 크기
    const width = 1200;
    const height = 400;

    // 투영법 설정
    const projection = d3.geoMercator()
      .center([40, 40])
      .scale(220)
      .translate([width / 2, height / 2]);

    const path = d3.geoPath().projection(projection);

    // 툴팁
    const tooltip = d3.select("body")
      .append("div")
      .attr("class", "world-map-tooltip")
      .style("position", "absolute")
      .style("opacity", 0)
      .style("background", "rgba(0, 0, 0, 0.8)")
      .style("color", "white")
      .style("padding", "8px 12px")
      .style("border-radius", "4px")
      .style("font-size", "12px")
      .style("pointer-events", "none")
      .style("z-index", 1000);

    // 지도 데이터 로드
    d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
      .then((data: any) => {
        setLoading(false);

        // SVG 생성
        const svg = d3.select(svgRef.current)
          .attr("width", width)
          .attr("height", height)
          .attr("viewBox", `0 0 ${width} ${height}`)
          .attr("preserveAspectRatio", "xMidYMid meet");

        // 화살표 마커 정의
        const defs = svg.append("defs");

        Object.keys(countryColors).forEach(country => {
          const color = countryColors[country];
          defs.append("marker")
            .attr("id", `arrowhead-${country}`)
            .attr("viewBox", "0 -5 10 10")
            .attr("refX", 8)
            .attr("refY", 0)
            .attr("markerWidth", 6)
            .attr("markerHeight", 6)
            .attr("orient", "auto")
            .append("path")
            .attr("d", "M0,-5L10,0L0,5")
            .attr("fill", color);
        });

        // TopoJSON을 GeoJSON으로 변환
        const countries = topojson.feature(data, data.objects.countries) as any;

        // 국가 이름 매핑
        const countryNameMap: Record<string, string> = {
          "United States of America": "USA",
          "United Kingdom": "UK",
          "Germany": "EU",
          "China": "China",
          "Japan": "Japan",
          "South Korea": "Korea"
        };

        // 국가별 자금 흐름 정보 계산
        const getCountryFlowInfo = (countryCode: string) => {
          if (!countryCode) return null;

          const outflows = flows.filter(f => f.fromCountry === countryCode);
          const inflows = flows.filter(f => f.toCountry === countryCode);

          return { outflows, inflows };
        };

        // 국가 경계선 그리기
        svg.append("g")
          .selectAll("path")
          .data(countries.features)
          .enter()
          .append("path")
          .attr("class", "country")
          .attr("d", d => path(d as d3.GeoPermissibleObjects) || "")
          .attr("fill", isDark ? "#374151" : "#e5e7eb")
          .attr("stroke", isDark ? "#6b7280" : "#9ca3af")
          .attr("stroke-width", 0.5)
          .on("mouseover", function(event: any, d: any) {
            const countryName = d.properties.name || "Unknown";
            const countryCode = countryNameMap[countryName];

            let tooltipContent = `<strong>${countryName}</strong>`;

            if (countryCode) {
              const flowInfo = getCountryFlowInfo(countryCode);
              const m2Info = m2Data[countryCode];

              tooltipContent += `<br/>M2: $${m2Info.value}B (${m2Info.change > 0 ? '+' : ''}${m2Info.change}%)`;

              if (flowInfo && flowInfo.outflows.length > 0) {
                tooltipContent += `<br/><br/><strong>자금 유출:</strong>`;
                flowInfo.outflows.forEach(flow => {
                  const amount = (m2Info.value * flow.intensity / 100).toFixed(0);
                  tooltipContent += `<br/>→ ${flow.to}: ~$${amount}B`;
                });
              }

              if (flowInfo && flowInfo.inflows.length > 0) {
                tooltipContent += `<br/><br/><strong>자금 유입:</strong>`;
                flowInfo.inflows.forEach(flow => {
                  const fromM2 = m2Data[flow.fromCountry];
                  const amount = (fromM2.value * flow.intensity / 100).toFixed(0);
                  tooltipContent += `<br/>← ${flow.from}: ~$${amount}B`;
                });
              }
            }

            tooltip
              .style("opacity", 0.9)
              .html(tooltipContent)
              .style("left", (event.pageX + 10) + "px")
              .style("top", (event.pageY - 28) + "px");
          })
          .on("mouseout", function() {
            tooltip.style("opacity", 0);
          });

        // 화살표 그리기
        const arrowsGroup = svg.append("g").attr("class", "arrows");

        // 도시 이름으로 좌표 찾기
        const getCityCoords = (cityName: string): [number, number] | null => {
          const city = cities.find(c => c.name === cityName);
          return city ? city.coords : null;
        };

        // 베지어 곡선 경로 생성
        const createCurvedPath = (from: [number, number], to: [number, number], direction = 1) => {
          const source = projection(from)!;
          const target = projection(to)!;

          const dx = target[0] - source[0];
          const dy = target[1] - source[1];
          const dr = Math.sqrt(dx * dx + dy * dy);

          const curvature = 0.3 * direction;
          const controlX = (source[0] + target[0]) / 2;
          const controlY = (source[1] + target[1]) / 2 - dr * curvature;

          return `M ${source[0]},${source[1]} Q ${controlX},${controlY} ${target[0]},${target[1]}`;
        };

        // 화살표 굵기 계산
        const getStrokeWidth = (amount: number) => {
          if (amount > 200) return 5;
          if (amount > 100) return 4;
          if (amount > 50) return 3;
          if (amount > 20) return 2.5;
          return 2;
        };

        // 화살표 그리기
        flows.forEach(flow => {
          const fromCoords = getCityCoords(flow.from);
          const toCoords = getCityCoords(flow.to);

          if (fromCoords && toCoords) {
            const strokeWidth = getStrokeWidth(flow.amount);
            const color = getCurrentColors()[flow.fromCountry];

            arrowsGroup.append("path")
              .attr("class", "flow-arrow")
              .attr("d", createCurvedPath(fromCoords, toCoords, flow.curveDirection))
              .attr("marker-end", `url(#arrowhead-${flow.fromCountry})`)
              .attr("stroke", color)
              .attr("stroke-width", strokeWidth)
              .attr("fill", "none")
              .attr("opacity", 0.7)
              .attr("stroke-dasharray", "5, 5")
              .style("cursor", "pointer")
              .on("mouseover", function(event: any) {
                d3.select(this).attr("opacity", 1);
                tooltip
                  .style("opacity", 0.9)
                  .html(`
                    <strong>자금 흐름</strong><br/>
                    ${flow.from} → ${flow.to}<br/>
                    추정 규모: ~$${flow.amount.toFixed(0)}B<br/>
                    M2 변화율: ${flow.fromM2Change}% → ${flow.toM2Change}%<br/>
                    <em>강도: ${flow.volume} (Δ${flow.intensity.toFixed(1)}%)</em>
                  `)
                  .style("left", (event.pageX + 10) + "px")
                  .style("top", (event.pageY - 28) + "px");
              })
              .on("mouseout", function() {
                d3.select(this).attr("opacity", 0.7);
                tooltip.style("opacity", 0);
              });
          }
        });

        // 도시 마커 그룹
        const markersGroup = svg.append("g").attr("class", "markers");

        // 도시 마커 추가
        markersGroup.selectAll("circle")
          .data(cities)
          .enter()
          .append("circle")
          .attr("class", "city-marker")
          .attr("cx", d => projection(d.coords)![0])
          .attr("cy", d => projection(d.coords)![1])
          .attr("r", 5)
          .attr("fill", d => getCurrentColors()[d.country])
          .attr("stroke", "white")
          .attr("stroke-width", 2)
          .style("cursor", "pointer")
          .on("mouseover", function(event: any, d: City) {
            const m2Info = m2Data[d.country];
            tooltip
              .style("opacity", 0.9)
              .html(`
                <strong>${d.name}</strong><br/>
                ${d.role}<br/>
                M2: $${m2Info.value}B (${m2Info.change > 0 ? '+' : ''}${m2Info.change}%)<br/>
                <em>${d.country}</em>
              `)
              .style("left", (event.pageX + 10) + "px")
              .style("top", (event.pageY - 28) + "px");
          })
          .on("mouseout", function() {
            tooltip.style("opacity", 0);
          });

        // 도시 라벨
        markersGroup.selectAll("text")
          .data(cities)
          .enter()
          .append("text")
          .attr("class", "city-label")
          .attr("x", d => projection(d.coords)![0])
          .attr("y", d => projection(d.coords)![1] - 10)
          .attr("text-anchor", "middle")
          .attr("font-size", "10px")
          .attr("fill", isDark ? "#e5e7eb" : "#374151")
          .attr("font-weight", "500")
          .text(d => d.name);

        // 범례 추가
        const legend = svg.append("g")
          .attr("class", "legend")
          .attr("transform", `translate(${width - 200}, ${height - 190})`);

        // 범례 배경
        legend.append("rect")
          .attr("class", "legend-box")
          .attr("width", 180)
          .attr("height", 170)
          .attr("x", 0)
          .attr("y", 0)
          .attr("fill", isDark ? "#1f2937" : "white")
          .attr("opacity", 0.95)
          .attr("stroke", isDark ? "#4b5563" : "#d1d5db")
          .attr("stroke-width", 1)
          .attr("rx", 4);

        // 범례 제목
        legend.append("text")
          .attr("class", "legend-title")
          .attr("x", 10)
          .attr("y", 18)
          .attr("font-size", "12px")
          .attr("font-weight", "bold")
          .attr("fill", isDark ? "#f3f4f6" : "#1f2937")
          .text("국가별 색상");

        legend.append("text")
          .attr("class", "legend-text")
          .attr("x", 10)
          .attr("y", 32)
          .attr("font-size", "9px")
          .attr("fill", isDark ? "#d1d5db" : "#6b7280")
          .text("(마커 & 화살표)");

        // 화살표 및 마커 범례
        const arrowLegends = [
          { country: "USA", label: "미국", y: 50 },
          { country: "UK", label: "영국", y: 65 },
          { country: "EU", label: "유럽", y: 80 },
          { country: "China", label: "중국", y: 95 },
          { country: "Japan", label: "일본", y: 110 },
          { country: "Korea", label: "한국", y: 125 }
        ];

        arrowLegends.forEach(item => {
          // 마커
          legend.append("circle")
            .attr("cx", 15)
            .attr("cy", item.y)
            .attr("r", 4)
            .attr("fill", getCurrentColors()[item.country])
            .attr("stroke", isDark ? "#1f2937" : "white")
            .attr("stroke-width", 1.5);

          // 화살표
          legend.append("line")
            .attr("x1", 23)
            .attr("y1", item.y)
            .attr("x2", 38)
            .attr("y2", item.y)
            .attr("stroke", getCurrentColors()[item.country])
            .attr("stroke-width", 2)
            .attr("stroke-dasharray", "3,3");

          // 라벨
          legend.append("text")
            .attr("class", "legend-text")
            .attr("x", 43)
            .attr("y", item.y + 4)
            .attr("font-size", "11px")
            .attr("fill", isDark ? "#e5e7eb" : "#374151")
            .text(item.label);
        });

        // 화살표 굵기 설명
        legend.append("text")
          .attr("class", "legend-text")
          .attr("x", 10)
          .attr("y", 153)
          .attr("font-size", "9px")
          .attr("fill", isDark ? "#d1d5db" : "#6b7280")
          .attr("font-style", "italic")
          .text("* 굵기 = 자금 이동 규모");
      })
      .catch(error => {
        console.error("Error loading map data:", error);
        setLoading(false);
      });

    // 클린업
    return () => {
      tooltip.remove();
    };
  }, [isDark, mounted]);

  return (
    <div ref={containerRef} className="relative w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      {loading && (
        <div className="flex items-center justify-center h-[400px]">
          <p className="text-gray-500 dark:text-gray-400">지도 데이터 로딩 중...</p>
        </div>
      )}
      <svg ref={svgRef} className="w-full h-auto" />
      <style jsx global>{`
        @keyframes dash {
          to {
            stroke-dashoffset: -1000;
          }
        }
        .flow-arrow {
          animation: dash 20s linear infinite;
        }
      `}</style>
    </div>
  );
};

export default WorldMap;
