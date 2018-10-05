/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? -10800000 : 0;
        var yOffset = options.yaxis.mode === "time" ? -10800000 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 885.0, "minX": 0.0, "maxY": 3240.0, "series": [{"data": [[0.0, 885.0], [0.1, 885.0], [0.2, 885.0], [0.3, 885.0], [0.4, 885.0], [0.5, 886.0], [0.6, 886.0], [0.7, 886.0], [0.8, 886.0], [0.9, 915.0], [1.0, 915.0], [1.1, 915.0], [1.2, 915.0], [1.3, 963.0], [1.4, 963.0], [1.5, 963.0], [1.6, 963.0], [1.7, 963.0], [1.8, 963.0], [1.9, 963.0], [2.0, 963.0], [2.1, 970.0], [2.2, 970.0], [2.3, 970.0], [2.4, 970.0], [2.5, 999.0], [2.6, 999.0], [2.7, 999.0], [2.8, 999.0], [2.9, 999.0], [3.0, 1015.0], [3.1, 1015.0], [3.2, 1015.0], [3.3, 1015.0], [3.4, 1020.0], [3.5, 1020.0], [3.6, 1020.0], [3.7, 1020.0], [3.8, 1112.0], [3.9, 1112.0], [4.0, 1112.0], [4.1, 1112.0], [4.2, 1117.0], [4.3, 1117.0], [4.4, 1117.0], [4.5, 1117.0], [4.6, 1130.0], [4.7, 1130.0], [4.8, 1130.0], [4.9, 1130.0], [5.0, 1207.0], [5.1, 1207.0], [5.2, 1207.0], [5.3, 1207.0], [5.4, 1229.0], [5.5, 1229.0], [5.6, 1229.0], [5.7, 1229.0], [5.8, 1229.0], [5.9, 1256.0], [6.0, 1256.0], [6.1, 1256.0], [6.2, 1256.0], [6.3, 1267.0], [6.4, 1267.0], [6.5, 1267.0], [6.6, 1267.0], [6.7, 1276.0], [6.8, 1276.0], [6.9, 1276.0], [7.0, 1276.0], [7.1, 1306.0], [7.2, 1306.0], [7.3, 1306.0], [7.4, 1306.0], [7.5, 1324.0], [7.6, 1324.0], [7.7, 1324.0], [7.8, 1324.0], [7.9, 1350.0], [8.0, 1350.0], [8.1, 1350.0], [8.2, 1350.0], [8.3, 1354.0], [8.4, 1354.0], [8.5, 1354.0], [8.6, 1354.0], [8.7, 1354.0], [8.8, 1362.0], [8.9, 1362.0], [9.0, 1362.0], [9.1, 1362.0], [9.2, 1406.0], [9.3, 1406.0], [9.4, 1406.0], [9.5, 1406.0], [9.6, 1482.0], [9.7, 1482.0], [9.8, 1482.0], [9.9, 1482.0], [10.0, 1549.0], [10.1, 1549.0], [10.2, 1549.0], [10.3, 1549.0], [10.4, 1596.0], [10.5, 1596.0], [10.6, 1596.0], [10.7, 1596.0], [10.8, 1651.0], [10.9, 1651.0], [11.0, 1651.0], [11.1, 1651.0], [11.2, 1651.0], [11.3, 1748.0], [11.4, 1748.0], [11.5, 1748.0], [11.6, 1748.0], [11.7, 1752.0], [11.8, 1752.0], [11.9, 1752.0], [12.0, 1752.0], [12.1, 1783.0], [12.2, 1783.0], [12.3, 1783.0], [12.4, 1783.0], [12.5, 1794.0], [12.6, 1794.0], [12.7, 1794.0], [12.8, 1794.0], [12.9, 1813.0], [13.0, 1813.0], [13.1, 1813.0], [13.2, 1813.0], [13.3, 1828.0], [13.4, 1828.0], [13.5, 1828.0], [13.6, 1828.0], [13.7, 1828.0], [13.8, 1828.0], [13.9, 1828.0], [14.0, 1828.0], [14.1, 1828.0], [14.2, 1836.0], [14.3, 1836.0], [14.4, 1836.0], [14.5, 1836.0], [14.6, 1856.0], [14.7, 1856.0], [14.8, 1856.0], [14.9, 1856.0], [15.0, 1865.0], [15.1, 1865.0], [15.2, 1865.0], [15.3, 1865.0], [15.4, 1867.0], [15.5, 1867.0], [15.6, 1867.0], [15.7, 1867.0], [15.8, 1870.0], [15.9, 1870.0], [16.0, 1870.0], [16.1, 1870.0], [16.2, 1875.0], [16.3, 1875.0], [16.4, 1875.0], [16.5, 1875.0], [16.6, 1912.0], [16.7, 1912.0], [16.8, 1912.0], [16.9, 1912.0], [17.0, 1912.0], [17.1, 1918.0], [17.2, 1918.0], [17.3, 1918.0], [17.4, 1918.0], [17.5, 1921.0], [17.6, 1921.0], [17.7, 1921.0], [17.8, 1921.0], [17.9, 1923.0], [18.0, 1923.0], [18.1, 1923.0], [18.2, 1923.0], [18.3, 1923.0], [18.4, 1923.0], [18.5, 1923.0], [18.6, 1923.0], [18.7, 1957.0], [18.8, 1957.0], [18.9, 1957.0], [19.0, 1957.0], [19.1, 1959.0], [19.2, 1959.0], [19.3, 1959.0], [19.4, 1959.0], [19.5, 1959.0], [19.6, 1962.0], [19.7, 1962.0], [19.8, 1962.0], [19.9, 1962.0], [20.0, 1972.0], [20.1, 1972.0], [20.2, 1972.0], [20.3, 1972.0], [20.4, 1973.0], [20.5, 1973.0], [20.6, 1973.0], [20.7, 1973.0], [20.8, 2006.0], [20.9, 2006.0], [21.0, 2006.0], [21.1, 2006.0], [21.2, 2015.0], [21.3, 2015.0], [21.4, 2015.0], [21.5, 2015.0], [21.6, 2019.0], [21.7, 2019.0], [21.8, 2019.0], [21.9, 2019.0], [22.0, 2021.0], [22.1, 2021.0], [22.2, 2021.0], [22.3, 2021.0], [22.4, 2021.0], [22.5, 2030.0], [22.6, 2030.0], [22.7, 2030.0], [22.8, 2030.0], [22.9, 2038.0], [23.0, 2038.0], [23.1, 2038.0], [23.2, 2038.0], [23.3, 2045.0], [23.4, 2045.0], [23.5, 2045.0], [23.6, 2045.0], [23.7, 2048.0], [23.8, 2048.0], [23.9, 2048.0], [24.0, 2048.0], [24.1, 2066.0], [24.2, 2066.0], [24.3, 2066.0], [24.4, 2066.0], [24.5, 2067.0], [24.6, 2067.0], [24.7, 2067.0], [24.8, 2067.0], [24.9, 2069.0], [25.0, 2069.0], [25.1, 2069.0], [25.2, 2069.0], [25.3, 2069.0], [25.4, 2070.0], [25.5, 2070.0], [25.6, 2070.0], [25.7, 2070.0], [25.8, 2085.0], [25.9, 2085.0], [26.0, 2085.0], [26.1, 2085.0], [26.2, 2088.0], [26.3, 2088.0], [26.4, 2088.0], [26.5, 2088.0], [26.6, 2095.0], [26.7, 2095.0], [26.8, 2095.0], [26.9, 2095.0], [27.0, 2096.0], [27.1, 2096.0], [27.2, 2096.0], [27.3, 2096.0], [27.4, 2115.0], [27.5, 2115.0], [27.6, 2115.0], [27.7, 2115.0], [27.8, 2115.0], [27.9, 2116.0], [28.0, 2116.0], [28.1, 2116.0], [28.2, 2116.0], [28.3, 2120.0], [28.4, 2120.0], [28.5, 2120.0], [28.6, 2120.0], [28.7, 2124.0], [28.8, 2124.0], [28.9, 2124.0], [29.0, 2124.0], [29.1, 2132.0], [29.2, 2132.0], [29.3, 2132.0], [29.4, 2132.0], [29.5, 2136.0], [29.6, 2136.0], [29.7, 2136.0], [29.8, 2136.0], [29.9, 2138.0], [30.0, 2138.0], [30.1, 2138.0], [30.2, 2138.0], [30.3, 2140.0], [30.4, 2140.0], [30.5, 2140.0], [30.6, 2140.0], [30.7, 2140.0], [30.8, 2141.0], [30.9, 2141.0], [31.0, 2141.0], [31.1, 2141.0], [31.2, 2149.0], [31.3, 2149.0], [31.4, 2149.0], [31.5, 2149.0], [31.6, 2160.0], [31.7, 2160.0], [31.8, 2160.0], [31.9, 2160.0], [32.0, 2161.0], [32.1, 2161.0], [32.2, 2161.0], [32.3, 2161.0], [32.4, 2162.0], [32.5, 2162.0], [32.6, 2162.0], [32.7, 2162.0], [32.8, 2163.0], [32.9, 2163.0], [33.0, 2163.0], [33.1, 2163.0], [33.2, 2164.0], [33.3, 2164.0], [33.4, 2164.0], [33.5, 2164.0], [33.6, 2164.0], [33.7, 2166.0], [33.8, 2166.0], [33.9, 2166.0], [34.0, 2166.0], [34.1, 2167.0], [34.2, 2167.0], [34.3, 2167.0], [34.4, 2167.0], [34.5, 2169.0], [34.6, 2169.0], [34.7, 2169.0], [34.8, 2169.0], [34.9, 2170.0], [35.0, 2170.0], [35.1, 2170.0], [35.2, 2170.0], [35.3, 2172.0], [35.4, 2172.0], [35.5, 2172.0], [35.6, 2172.0], [35.7, 2173.0], [35.8, 2173.0], [35.9, 2173.0], [36.0, 2173.0], [36.1, 2176.0], [36.2, 2176.0], [36.3, 2176.0], [36.4, 2176.0], [36.5, 2176.0], [36.6, 2176.0], [36.7, 2176.0], [36.8, 2176.0], [36.9, 2176.0], [37.0, 2182.0], [37.1, 2182.0], [37.2, 2182.0], [37.3, 2182.0], [37.4, 2184.0], [37.5, 2184.0], [37.6, 2184.0], [37.7, 2184.0], [37.8, 2186.0], [37.9, 2186.0], [38.0, 2186.0], [38.1, 2186.0], [38.2, 2188.0], [38.3, 2188.0], [38.4, 2188.0], [38.5, 2188.0], [38.6, 2188.0], [38.7, 2188.0], [38.8, 2188.0], [38.9, 2188.0], [39.0, 2188.0], [39.1, 2189.0], [39.2, 2189.0], [39.3, 2189.0], [39.4, 2189.0], [39.5, 2189.0], [39.6, 2189.0], [39.7, 2189.0], [39.8, 2189.0], [39.9, 2197.0], [40.0, 2197.0], [40.1, 2197.0], [40.2, 2197.0], [40.3, 2203.0], [40.4, 2203.0], [40.5, 2203.0], [40.6, 2203.0], [40.7, 2204.0], [40.8, 2204.0], [40.9, 2204.0], [41.0, 2204.0], [41.1, 2206.0], [41.2, 2206.0], [41.3, 2206.0], [41.4, 2206.0], [41.5, 2210.0], [41.6, 2210.0], [41.7, 2210.0], [41.8, 2210.0], [41.9, 2210.0], [42.0, 2217.0], [42.1, 2217.0], [42.2, 2217.0], [42.3, 2217.0], [42.4, 2221.0], [42.5, 2221.0], [42.6, 2221.0], [42.7, 2221.0], [42.8, 2225.0], [42.9, 2225.0], [43.0, 2225.0], [43.1, 2225.0], [43.2, 2226.0], [43.3, 2226.0], [43.4, 2226.0], [43.5, 2226.0], [43.6, 2238.0], [43.7, 2238.0], [43.8, 2238.0], [43.9, 2238.0], [44.0, 2238.0], [44.1, 2238.0], [44.2, 2238.0], [44.3, 2238.0], [44.4, 2240.0], [44.5, 2240.0], [44.6, 2240.0], [44.7, 2240.0], [44.8, 2240.0], [44.9, 2242.0], [45.0, 2242.0], [45.1, 2242.0], [45.2, 2242.0], [45.3, 2243.0], [45.4, 2243.0], [45.5, 2243.0], [45.6, 2243.0], [45.7, 2244.0], [45.8, 2244.0], [45.9, 2244.0], [46.0, 2244.0], [46.1, 2249.0], [46.2, 2249.0], [46.3, 2249.0], [46.4, 2249.0], [46.5, 2250.0], [46.6, 2250.0], [46.7, 2250.0], [46.8, 2250.0], [46.9, 2251.0], [47.0, 2251.0], [47.1, 2251.0], [47.2, 2251.0], [47.3, 2251.0], [47.4, 2256.0], [47.5, 2256.0], [47.6, 2256.0], [47.7, 2256.0], [47.8, 2258.0], [47.9, 2258.0], [48.0, 2258.0], [48.1, 2258.0], [48.2, 2262.0], [48.3, 2262.0], [48.4, 2262.0], [48.5, 2262.0], [48.6, 2264.0], [48.7, 2264.0], [48.8, 2264.0], [48.9, 2264.0], [49.0, 2267.0], [49.1, 2267.0], [49.2, 2267.0], [49.3, 2267.0], [49.4, 2267.0], [49.5, 2267.0], [49.6, 2267.0], [49.7, 2267.0], [49.8, 2268.0], [49.9, 2268.0], [50.0, 2268.0], [50.1, 2268.0], [50.2, 2268.0], [50.3, 2277.0], [50.4, 2277.0], [50.5, 2277.0], [50.6, 2277.0], [50.7, 2280.0], [50.8, 2280.0], [50.9, 2280.0], [51.0, 2280.0], [51.1, 2284.0], [51.2, 2284.0], [51.3, 2284.0], [51.4, 2284.0], [51.5, 2294.0], [51.6, 2294.0], [51.7, 2294.0], [51.8, 2294.0], [51.9, 2296.0], [52.0, 2296.0], [52.1, 2296.0], [52.2, 2296.0], [52.3, 2297.0], [52.4, 2297.0], [52.5, 2297.0], [52.6, 2297.0], [52.7, 2303.0], [52.8, 2303.0], [52.9, 2303.0], [53.0, 2303.0], [53.1, 2303.0], [53.2, 2306.0], [53.3, 2306.0], [53.4, 2306.0], [53.5, 2306.0], [53.6, 2306.0], [53.7, 2306.0], [53.8, 2306.0], [53.9, 2306.0], [54.0, 2312.0], [54.1, 2312.0], [54.2, 2312.0], [54.3, 2312.0], [54.4, 2312.0], [54.5, 2312.0], [54.6, 2312.0], [54.7, 2312.0], [54.8, 2319.0], [54.9, 2319.0], [55.0, 2319.0], [55.1, 2319.0], [55.2, 2321.0], [55.3, 2321.0], [55.4, 2321.0], [55.5, 2321.0], [55.6, 2321.0], [55.7, 2322.0], [55.8, 2322.0], [55.9, 2322.0], [56.0, 2322.0], [56.1, 2324.0], [56.2, 2324.0], [56.3, 2324.0], [56.4, 2324.0], [56.5, 2331.0], [56.6, 2331.0], [56.7, 2331.0], [56.8, 2331.0], [56.9, 2334.0], [57.0, 2334.0], [57.1, 2334.0], [57.2, 2334.0], [57.3, 2336.0], [57.4, 2336.0], [57.5, 2336.0], [57.6, 2336.0], [57.7, 2336.0], [57.8, 2336.0], [57.9, 2336.0], [58.0, 2336.0], [58.1, 2341.0], [58.2, 2341.0], [58.3, 2341.0], [58.4, 2341.0], [58.5, 2341.0], [58.6, 2349.0], [58.7, 2349.0], [58.8, 2349.0], [58.9, 2349.0], [59.0, 2349.0], [59.1, 2349.0], [59.2, 2349.0], [59.3, 2349.0], [59.4, 2353.0], [59.5, 2353.0], [59.6, 2353.0], [59.7, 2353.0], [59.8, 2354.0], [59.9, 2354.0], [60.0, 2354.0], [60.1, 2354.0], [60.2, 2358.0], [60.3, 2358.0], [60.4, 2358.0], [60.5, 2358.0], [60.6, 2363.0], [60.7, 2363.0], [60.8, 2363.0], [60.9, 2363.0], [61.0, 2369.0], [61.1, 2369.0], [61.2, 2369.0], [61.3, 2369.0], [61.4, 2369.0], [61.5, 2370.0], [61.6, 2370.0], [61.7, 2370.0], [61.8, 2370.0], [61.9, 2371.0], [62.0, 2371.0], [62.1, 2371.0], [62.2, 2371.0], [62.3, 2376.0], [62.4, 2376.0], [62.5, 2376.0], [62.6, 2376.0], [62.7, 2382.0], [62.8, 2382.0], [62.9, 2382.0], [63.0, 2382.0], [63.1, 2385.0], [63.2, 2385.0], [63.3, 2385.0], [63.4, 2385.0], [63.5, 2388.0], [63.6, 2388.0], [63.7, 2388.0], [63.8, 2388.0], [63.9, 2388.0], [64.0, 2394.0], [64.1, 2394.0], [64.2, 2394.0], [64.3, 2394.0], [64.4, 2394.0], [64.5, 2394.0], [64.6, 2394.0], [64.7, 2394.0], [64.8, 2399.0], [64.9, 2399.0], [65.0, 2399.0], [65.1, 2399.0], [65.2, 2399.0], [65.3, 2399.0], [65.4, 2399.0], [65.5, 2399.0], [65.6, 2402.0], [65.7, 2402.0], [65.8, 2402.0], [65.9, 2402.0], [66.0, 2405.0], [66.1, 2405.0], [66.2, 2405.0], [66.3, 2405.0], [66.4, 2407.0], [66.5, 2407.0], [66.6, 2407.0], [66.7, 2407.0], [66.8, 2407.0], [66.9, 2410.0], [67.0, 2410.0], [67.1, 2410.0], [67.2, 2410.0], [67.3, 2414.0], [67.4, 2414.0], [67.5, 2414.0], [67.6, 2414.0], [67.7, 2418.0], [67.8, 2418.0], [67.9, 2418.0], [68.0, 2418.0], [68.1, 2421.0], [68.2, 2421.0], [68.3, 2421.0], [68.4, 2421.0], [68.5, 2430.0], [68.6, 2430.0], [68.7, 2430.0], [68.8, 2430.0], [68.9, 2430.0], [69.0, 2430.0], [69.1, 2430.0], [69.2, 2430.0], [69.3, 2430.0], [69.4, 2430.0], [69.5, 2430.0], [69.6, 2430.0], [69.7, 2430.0], [69.8, 2443.0], [69.9, 2443.0], [70.0, 2443.0], [70.1, 2443.0], [70.2, 2445.0], [70.3, 2445.0], [70.4, 2445.0], [70.5, 2445.0], [70.6, 2451.0], [70.7, 2451.0], [70.8, 2451.0], [70.9, 2451.0], [71.0, 2454.0], [71.1, 2454.0], [71.2, 2454.0], [71.3, 2454.0], [71.4, 2455.0], [71.5, 2455.0], [71.6, 2455.0], [71.7, 2455.0], [71.8, 2457.0], [71.9, 2457.0], [72.0, 2457.0], [72.1, 2457.0], [72.2, 2460.0], [72.3, 2460.0], [72.4, 2460.0], [72.5, 2460.0], [72.6, 2460.0], [72.7, 2461.0], [72.8, 2461.0], [72.9, 2461.0], [73.0, 2461.0], [73.1, 2467.0], [73.2, 2467.0], [73.3, 2467.0], [73.4, 2467.0], [73.5, 2476.0], [73.6, 2476.0], [73.7, 2476.0], [73.8, 2476.0], [73.9, 2478.0], [74.0, 2478.0], [74.1, 2478.0], [74.2, 2478.0], [74.3, 2478.0], [74.4, 2478.0], [74.5, 2478.0], [74.6, 2478.0], [74.7, 2485.0], [74.8, 2485.0], [74.9, 2485.0], [75.0, 2485.0], [75.1, 2485.0], [75.2, 2488.0], [75.3, 2488.0], [75.4, 2488.0], [75.5, 2488.0], [75.6, 2502.0], [75.7, 2502.0], [75.8, 2502.0], [75.9, 2502.0], [76.0, 2509.0], [76.1, 2509.0], [76.2, 2509.0], [76.3, 2509.0], [76.4, 2519.0], [76.5, 2519.0], [76.6, 2519.0], [76.7, 2519.0], [76.8, 2521.0], [76.9, 2521.0], [77.0, 2521.0], [77.1, 2521.0], [77.2, 2522.0], [77.3, 2522.0], [77.4, 2522.0], [77.5, 2522.0], [77.6, 2525.0], [77.7, 2525.0], [77.8, 2525.0], [77.9, 2525.0], [78.0, 2525.0], [78.1, 2531.0], [78.2, 2531.0], [78.3, 2531.0], [78.4, 2531.0], [78.5, 2531.0], [78.6, 2531.0], [78.7, 2531.0], [78.8, 2531.0], [78.9, 2532.0], [79.0, 2532.0], [79.1, 2532.0], [79.2, 2532.0], [79.3, 2532.0], [79.4, 2532.0], [79.5, 2532.0], [79.6, 2532.0], [79.7, 2535.0], [79.8, 2535.0], [79.9, 2535.0], [80.0, 2535.0], [80.1, 2539.0], [80.2, 2539.0], [80.3, 2539.0], [80.4, 2539.0], [80.5, 2546.0], [80.6, 2546.0], [80.7, 2546.0], [80.8, 2546.0], [80.9, 2546.0], [81.0, 2548.0], [81.1, 2548.0], [81.2, 2548.0], [81.3, 2548.0], [81.4, 2563.0], [81.5, 2563.0], [81.6, 2563.0], [81.7, 2563.0], [81.8, 2564.0], [81.9, 2564.0], [82.0, 2564.0], [82.1, 2564.0], [82.2, 2596.0], [82.3, 2596.0], [82.4, 2596.0], [82.5, 2596.0], [82.6, 2597.0], [82.7, 2597.0], [82.8, 2597.0], [82.9, 2597.0], [83.0, 2600.0], [83.1, 2600.0], [83.2, 2600.0], [83.3, 2600.0], [83.4, 2600.0], [83.5, 2604.0], [83.6, 2604.0], [83.7, 2604.0], [83.8, 2604.0], [83.9, 2604.0], [84.0, 2604.0], [84.1, 2604.0], [84.2, 2604.0], [84.3, 2607.0], [84.4, 2607.0], [84.5, 2607.0], [84.6, 2607.0], [84.7, 2608.0], [84.8, 2608.0], [84.9, 2608.0], [85.0, 2608.0], [85.1, 2608.0], [85.2, 2608.0], [85.3, 2608.0], [85.4, 2608.0], [85.5, 2614.0], [85.6, 2614.0], [85.7, 2614.0], [85.8, 2614.0], [85.9, 2617.0], [86.0, 2617.0], [86.1, 2617.0], [86.2, 2617.0], [86.3, 2617.0], [86.4, 2629.0], [86.5, 2629.0], [86.6, 2629.0], [86.7, 2629.0], [86.8, 2639.0], [86.9, 2639.0], [87.0, 2639.0], [87.1, 2639.0], [87.2, 2642.0], [87.3, 2642.0], [87.4, 2642.0], [87.5, 2642.0], [87.6, 2654.0], [87.7, 2654.0], [87.8, 2654.0], [87.9, 2654.0], [88.0, 2667.0], [88.1, 2667.0], [88.2, 2667.0], [88.3, 2667.0], [88.4, 2675.0], [88.5, 2675.0], [88.6, 2675.0], [88.7, 2675.0], [88.8, 2687.0], [88.9, 2687.0], [89.0, 2687.0], [89.1, 2687.0], [89.2, 2687.0], [89.3, 2688.0], [89.4, 2688.0], [89.5, 2688.0], [89.6, 2688.0], [89.7, 2717.0], [89.8, 2717.0], [89.9, 2717.0], [90.0, 2717.0], [90.1, 2722.0], [90.2, 2722.0], [90.3, 2722.0], [90.4, 2722.0], [90.5, 2734.0], [90.6, 2734.0], [90.7, 2734.0], [90.8, 2734.0], [90.9, 2740.0], [91.0, 2740.0], [91.1, 2740.0], [91.2, 2740.0], [91.3, 2760.0], [91.4, 2760.0], [91.5, 2760.0], [91.6, 2760.0], [91.7, 2760.0], [91.8, 2763.0], [91.9, 2763.0], [92.0, 2763.0], [92.1, 2763.0], [92.2, 2772.0], [92.3, 2772.0], [92.4, 2772.0], [92.5, 2772.0], [92.6, 2792.0], [92.7, 2792.0], [92.8, 2792.0], [92.9, 2792.0], [93.0, 2824.0], [93.1, 2824.0], [93.2, 2824.0], [93.3, 2824.0], [93.4, 2842.0], [93.5, 2842.0], [93.6, 2842.0], [93.7, 2842.0], [93.8, 2853.0], [93.9, 2853.0], [94.0, 2853.0], [94.1, 2853.0], [94.2, 2856.0], [94.3, 2856.0], [94.4, 2856.0], [94.5, 2856.0], [94.6, 2856.0], [94.7, 2861.0], [94.8, 2861.0], [94.9, 2861.0], [95.0, 2861.0], [95.1, 2950.0], [95.2, 2950.0], [95.3, 2950.0], [95.4, 2950.0], [95.5, 2963.0], [95.6, 2963.0], [95.7, 2963.0], [95.8, 2963.0], [95.9, 2980.0], [96.0, 2980.0], [96.1, 2980.0], [96.2, 2980.0], [96.3, 2985.0], [96.4, 2985.0], [96.5, 2985.0], [96.6, 2985.0], [96.7, 2994.0], [96.8, 2994.0], [96.9, 2994.0], [97.0, 2994.0], [97.1, 3021.0], [97.2, 3021.0], [97.3, 3021.0], [97.4, 3021.0], [97.5, 3021.0], [97.6, 3075.0], [97.7, 3075.0], [97.8, 3075.0], [97.9, 3075.0], [98.0, 3117.0], [98.1, 3117.0], [98.2, 3117.0], [98.3, 3117.0], [98.4, 3119.0], [98.5, 3119.0], [98.6, 3119.0], [98.7, 3119.0], [98.8, 3213.0], [98.9, 3213.0], [99.0, 3213.0], [99.1, 3213.0], [99.2, 3229.0], [99.3, 3229.0], [99.4, 3229.0], [99.5, 3229.0], [99.6, 3240.0], [99.7, 3240.0], [99.8, 3240.0], [99.9, 3240.0]], "isOverall": false, "label": "https://uat-ganheonline.dotz.com.br/", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 800.0, "maxY": 31.0, "series": [{"data": [[800.0, 2.0], [900.0, 5.0], [1000.0, 2.0], [1100.0, 3.0], [1200.0, 5.0], [1300.0, 5.0], [1400.0, 2.0], [1500.0, 2.0], [1600.0, 1.0], [1700.0, 4.0], [1800.0, 9.0], [1900.0, 10.0], [2000.0, 16.0], [2100.0, 31.0], [2200.0, 30.0], [2300.0, 31.0], [2400.0, 24.0], [2500.0, 18.0], [2600.0, 16.0], [2700.0, 8.0], [2800.0, 5.0], [2900.0, 5.0], [3000.0, 2.0], [3100.0, 2.0], [3200.0, 3.0]], "isOverall": false, "label": "https://uat-ganheonline.dotz.com.br/", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 3200.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 24.0, "minX": 1.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 217.0, "series": [{"data": [[1.0, 24.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[2.0, 217.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 6.538461538461538, "minX": 1.53851814E12, "maxY": 9.263157894736839, "series": [{"data": [[1.5385182E12, 6.538461538461538], [1.53851814E12, 9.263157894736839]], "isOverall": false, "label": "Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5385182E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -10800000);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 1130.5, "minX": 1.0, "maxY": 2382.948186528498, "series": [{"data": [[1.0, 1134.5], [2.0, 1130.5], [4.0, 1405.6], [8.0, 1963.0], [9.0, 2021.2857142857144], [5.0, 1406.875], [10.0, 2382.948186528498], [3.0, 1149.2], [6.0, 1630.0], [7.0, 1823.0]], "isOverall": false, "label": "https://uat-ganheonline.dotz.com.br/", "isController": false}, {"data": [[9.116182572614106, 2222.203319502075]], "isOverall": false, "label": "https://uat-ganheonline.dotz.com.br/-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 10.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 63.266666666666666, "minX": 1.53851814E12, "maxY": 495223.6, "series": [{"data": [[1.5385182E12, 28236.433333333334], [1.53851814E12, 495223.6]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.5385182E12, 63.266666666666666], [1.53851814E12, 1109.6]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5385182E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -10800000);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 2219.7061403508774, "minX": 1.53851814E12, "maxY": 2265.9999999999995, "series": [{"data": [[1.5385182E12, 2265.9999999999995], [1.53851814E12, 2219.7061403508774]], "isOverall": false, "label": "https://uat-ganheonline.dotz.com.br/", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5385182E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -10800000);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 768.5921052631575, "minX": 1.53851814E12, "maxY": 802.6153846153846, "series": [{"data": [[1.5385182E12, 802.6153846153846], [1.53851814E12, 768.5921052631575]], "isOverall": false, "label": "https://uat-ganheonline.dotz.com.br/", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5385182E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -10800000);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 39.15384615384615, "minX": 1.53851814E12, "maxY": 43.95175438596495, "series": [{"data": [[1.5385182E12, 39.15384615384615], [1.53851814E12, 43.95175438596495]], "isOverall": false, "label": "https://uat-ganheonline.dotz.com.br/", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5385182E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -10800000);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 885.0, "minX": 1.53851814E12, "maxY": 3240.0, "series": [{"data": [[1.5385182E12, 2824.0], [1.53851814E12, 3240.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.5385182E12, 1306.0], [1.53851814E12, 885.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.5385182E12, 2721.0], [1.53851814E12, 2723.2]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.5385182E12, 3222.2799999999997], [1.53851814E12, 3224.36]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.5385182E12, 2941.099999999998], [1.53851814E12, 2957.1499999999996]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5385182E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -10800000);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 2267.5, "minX": 0.0, "maxY": 2334.0, "series": [{"data": [[0.0, 2334.0], [3.0, 2267.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 3.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 761.0, "minX": 0.0, "maxY": 797.0, "series": [{"data": [[0.0, 797.0], [3.0, 761.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 3.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 0.05, "minX": 1.53851814E12, "maxY": 3.966666666666667, "series": [{"data": [[1.5385182E12, 0.05], [1.53851814E12, 3.966666666666667]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5385182E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -10800000);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 0.21666666666666667, "minX": 1.53851814E12, "maxY": 3.8, "series": [{"data": [[1.5385182E12, 0.21666666666666667], [1.53851814E12, 3.8]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5385182E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -10800000);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 0.21666666666666667, "minX": 1.53851814E12, "maxY": 3.8, "series": [{"data": [[1.5385182E12, 0.21666666666666667], [1.53851814E12, 3.8]], "isOverall": false, "label": "https://uat-ganheonline.dotz.com.br/-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5385182E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -10800000);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
