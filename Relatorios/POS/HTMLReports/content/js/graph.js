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
        data: {"result": {"minY": 73.0, "minX": 0.0, "maxY": 30107.0, "series": [{"data": [[0.0, 73.0], [0.1, 73.0], [0.2, 73.0], [0.3, 73.0], [0.4, 964.0], [0.5, 964.0], [0.6, 964.0], [0.7, 990.0], [0.8, 990.0], [0.9, 990.0], [1.0, 1005.0], [1.1, 1005.0], [1.2, 1005.0], [1.3, 1030.0], [1.4, 1030.0], [1.5, 1030.0], [1.6, 1132.0], [1.7, 1132.0], [1.8, 1132.0], [1.9, 1248.0], [2.0, 1248.0], [2.1, 1248.0], [2.2, 1248.0], [2.3, 1392.0], [2.4, 1392.0], [2.5, 1392.0], [2.6, 1432.0], [2.7, 1432.0], [2.8, 1432.0], [2.9, 1443.0], [3.0, 1443.0], [3.1, 1443.0], [3.2, 1511.0], [3.3, 1511.0], [3.4, 1511.0], [3.5, 1537.0], [3.6, 1537.0], [3.7, 1537.0], [3.8, 1538.0], [3.9, 1538.0], [4.0, 1538.0], [4.1, 1570.0], [4.2, 1570.0], [4.3, 1570.0], [4.4, 1570.0], [4.5, 1597.0], [4.6, 1597.0], [4.7, 1597.0], [4.8, 1657.0], [4.9, 1657.0], [5.0, 1657.0], [5.1, 1693.0], [5.2, 1693.0], [5.3, 1693.0], [5.4, 1696.0], [5.5, 1696.0], [5.6, 1696.0], [5.7, 1764.0], [5.8, 1764.0], [5.9, 1764.0], [6.0, 1879.0], [6.1, 1879.0], [6.2, 1879.0], [6.3, 1891.0], [6.4, 1891.0], [6.5, 1891.0], [6.6, 1891.0], [6.7, 2022.0], [6.8, 2022.0], [6.9, 2022.0], [7.0, 2032.0], [7.1, 2032.0], [7.2, 2032.0], [7.3, 2048.0], [7.4, 2048.0], [7.5, 2048.0], [7.6, 2090.0], [7.7, 2090.0], [7.8, 2090.0], [7.9, 2216.0], [8.0, 2216.0], [8.1, 2216.0], [8.2, 2228.0], [8.3, 2228.0], [8.4, 2228.0], [8.5, 2287.0], [8.6, 2287.0], [8.7, 2287.0], [8.8, 2287.0], [8.9, 2369.0], [9.0, 2369.0], [9.1, 2369.0], [9.2, 2426.0], [9.3, 2426.0], [9.4, 2426.0], [9.5, 2494.0], [9.6, 2494.0], [9.7, 2494.0], [9.8, 2666.0], [9.9, 2666.0], [10.0, 2666.0], [10.1, 2680.0], [10.2, 2680.0], [10.3, 2680.0], [10.4, 2839.0], [10.5, 2839.0], [10.6, 2839.0], [10.7, 2871.0], [10.8, 2871.0], [10.9, 2871.0], [11.0, 2871.0], [11.1, 2915.0], [11.2, 2915.0], [11.3, 2915.0], [11.4, 2958.0], [11.5, 2958.0], [11.6, 2958.0], [11.7, 3022.0], [11.8, 3022.0], [11.9, 3022.0], [12.0, 3037.0], [12.1, 3037.0], [12.2, 3037.0], [12.3, 3050.0], [12.4, 3050.0], [12.5, 3050.0], [12.6, 3152.0], [12.7, 3152.0], [12.8, 3152.0], [12.9, 3198.0], [13.0, 3198.0], [13.1, 3198.0], [13.2, 3198.0], [13.3, 3198.0], [13.4, 3198.0], [13.5, 3198.0], [13.6, 3281.0], [13.7, 3281.0], [13.8, 3281.0], [13.9, 3506.0], [14.0, 3506.0], [14.1, 3506.0], [14.2, 3548.0], [14.3, 3548.0], [14.4, 3548.0], [14.5, 3649.0], [14.6, 3649.0], [14.7, 3649.0], [14.8, 3659.0], [14.9, 3659.0], [15.0, 3659.0], [15.1, 3670.0], [15.2, 3670.0], [15.3, 3670.0], [15.4, 3670.0], [15.5, 3698.0], [15.6, 3698.0], [15.7, 3698.0], [15.8, 3768.0], [15.9, 3768.0], [16.0, 3768.0], [16.1, 3895.0], [16.2, 3895.0], [16.3, 3895.0], [16.4, 3921.0], [16.5, 3921.0], [16.6, 3921.0], [16.7, 3982.0], [16.8, 3982.0], [16.9, 3982.0], [17.0, 4033.0], [17.1, 4033.0], [17.2, 4033.0], [17.3, 4099.0], [17.4, 4099.0], [17.5, 4099.0], [17.6, 4099.0], [17.7, 4109.0], [17.8, 4109.0], [17.9, 4109.0], [18.0, 4366.0], [18.1, 4366.0], [18.2, 4366.0], [18.3, 4388.0], [18.4, 4388.0], [18.5, 4388.0], [18.6, 4534.0], [18.7, 4534.0], [18.8, 4534.0], [18.9, 4576.0], [19.0, 4576.0], [19.1, 4576.0], [19.2, 4758.0], [19.3, 4758.0], [19.4, 4758.0], [19.5, 4901.0], [19.6, 4901.0], [19.7, 4901.0], [19.8, 4901.0], [19.9, 4943.0], [20.0, 4943.0], [20.1, 4943.0], [20.2, 5026.0], [20.3, 5026.0], [20.4, 5026.0], [20.5, 5072.0], [20.6, 5072.0], [20.7, 5072.0], [20.8, 5075.0], [20.9, 5075.0], [21.0, 5075.0], [21.1, 5155.0], [21.2, 5155.0], [21.3, 5155.0], [21.4, 5310.0], [21.5, 5310.0], [21.6, 5310.0], [21.7, 5646.0], [21.8, 5646.0], [21.9, 5646.0], [22.0, 5646.0], [22.1, 5683.0], [22.2, 5683.0], [22.3, 5683.0], [22.4, 5844.0], [22.5, 5844.0], [22.6, 5844.0], [22.7, 5883.0], [22.8, 5883.0], [22.9, 5883.0], [23.0, 5913.0], [23.1, 5913.0], [23.2, 5913.0], [23.3, 6007.0], [23.4, 6007.0], [23.5, 6007.0], [23.6, 6078.0], [23.7, 6078.0], [23.8, 6078.0], [23.9, 6239.0], [24.0, 6239.0], [24.1, 6239.0], [24.2, 6239.0], [24.3, 6405.0], [24.4, 6405.0], [24.5, 6405.0], [24.6, 6490.0], [24.7, 6490.0], [24.8, 6490.0], [24.9, 6553.0], [25.0, 6553.0], [25.1, 6553.0], [25.2, 6816.0], [25.3, 6816.0], [25.4, 6816.0], [25.5, 6819.0], [25.6, 6819.0], [25.7, 6819.0], [25.8, 6964.0], [25.9, 6964.0], [26.0, 6964.0], [26.1, 6964.0], [26.2, 7059.0], [26.3, 7059.0], [26.4, 7059.0], [26.5, 7521.0], [26.6, 7521.0], [26.7, 7521.0], [26.8, 7562.0], [26.9, 7562.0], [27.0, 7562.0], [27.1, 7662.0], [27.2, 7662.0], [27.3, 7662.0], [27.4, 7664.0], [27.5, 7664.0], [27.6, 7664.0], [27.7, 7708.0], [27.8, 7708.0], [27.9, 7708.0], [28.0, 7722.0], [28.1, 7722.0], [28.2, 7722.0], [28.3, 7722.0], [28.4, 7793.0], [28.5, 7793.0], [28.6, 7793.0], [28.7, 7836.0], [28.8, 7836.0], [28.9, 7836.0], [29.0, 7989.0], [29.1, 7989.0], [29.2, 7989.0], [29.3, 8066.0], [29.4, 8066.0], [29.5, 8066.0], [29.6, 8232.0], [29.7, 8232.0], [29.8, 8232.0], [29.9, 8436.0], [30.0, 8436.0], [30.1, 8436.0], [30.2, 8461.0], [30.3, 8461.0], [30.4, 8461.0], [30.5, 8461.0], [30.6, 8535.0], [30.7, 8535.0], [30.8, 8535.0], [30.9, 9243.0], [31.0, 9243.0], [31.1, 9243.0], [31.2, 9397.0], [31.3, 9397.0], [31.4, 9397.0], [31.5, 9500.0], [31.6, 9500.0], [31.7, 9500.0], [31.8, 9615.0], [31.9, 9615.0], [32.0, 9615.0], [32.1, 9632.0], [32.2, 9632.0], [32.3, 9632.0], [32.4, 9670.0], [32.5, 9670.0], [32.6, 9670.0], [32.7, 9670.0], [32.8, 9908.0], [32.9, 9908.0], [33.0, 9908.0], [33.1, 9992.0], [33.2, 9992.0], [33.3, 9992.0], [33.4, 10027.0], [33.5, 10027.0], [33.6, 10027.0], [33.7, 10029.0], [33.8, 10029.0], [33.9, 10029.0], [34.0, 10106.0], [34.1, 10106.0], [34.2, 10106.0], [34.3, 10270.0], [34.4, 10270.0], [34.5, 10270.0], [34.6, 10310.0], [34.7, 10310.0], [34.8, 10310.0], [34.9, 10310.0], [35.0, 10389.0], [35.1, 10389.0], [35.2, 10389.0], [35.3, 10503.0], [35.4, 10503.0], [35.5, 10503.0], [35.6, 10575.0], [35.7, 10575.0], [35.8, 10575.0], [35.9, 10673.0], [36.0, 10673.0], [36.1, 10673.0], [36.2, 10675.0], [36.3, 10675.0], [36.4, 10675.0], [36.5, 10790.0], [36.6, 10790.0], [36.7, 10790.0], [36.8, 10792.0], [36.9, 10792.0], [37.0, 10792.0], [37.1, 10792.0], [37.2, 10826.0], [37.3, 10826.0], [37.4, 10826.0], [37.5, 11062.0], [37.6, 11062.0], [37.7, 11062.0], [37.8, 11219.0], [37.9, 11219.0], [38.0, 11219.0], [38.1, 11386.0], [38.2, 11386.0], [38.3, 11386.0], [38.4, 11407.0], [38.5, 11407.0], [38.6, 11407.0], [38.7, 11425.0], [38.8, 11425.0], [38.9, 11425.0], [39.0, 11587.0], [39.1, 11587.0], [39.2, 11587.0], [39.3, 11587.0], [39.4, 11608.0], [39.5, 11608.0], [39.6, 11608.0], [39.7, 11711.0], [39.8, 11711.0], [39.9, 11711.0], [40.0, 11712.0], [40.1, 11712.0], [40.2, 11712.0], [40.3, 11734.0], [40.4, 11734.0], [40.5, 11734.0], [40.6, 11828.0], [40.7, 11828.0], [40.8, 11828.0], [40.9, 11856.0], [41.0, 11856.0], [41.1, 11856.0], [41.2, 11902.0], [41.3, 11902.0], [41.4, 11902.0], [41.5, 11902.0], [41.6, 11932.0], [41.7, 11932.0], [41.8, 11932.0], [41.9, 11938.0], [42.0, 11938.0], [42.1, 11938.0], [42.2, 12072.0], [42.3, 12072.0], [42.4, 12072.0], [42.5, 12187.0], [42.6, 12187.0], [42.7, 12187.0], [42.8, 12210.0], [42.9, 12210.0], [43.0, 12210.0], [43.1, 12637.0], [43.2, 12637.0], [43.3, 12637.0], [43.4, 12670.0], [43.5, 12670.0], [43.6, 12670.0], [43.7, 12670.0], [43.8, 12912.0], [43.9, 12912.0], [44.0, 12912.0], [44.1, 12922.0], [44.2, 12922.0], [44.3, 12922.0], [44.4, 12949.0], [44.5, 12949.0], [44.6, 12949.0], [44.7, 12975.0], [44.8, 12975.0], [44.9, 12975.0], [45.0, 12992.0], [45.1, 12992.0], [45.2, 12992.0], [45.3, 13305.0], [45.4, 13305.0], [45.5, 13305.0], [45.6, 13411.0], [45.7, 13411.0], [45.8, 13411.0], [45.9, 13411.0], [46.0, 13525.0], [46.1, 13525.0], [46.2, 13525.0], [46.3, 13628.0], [46.4, 13628.0], [46.5, 13628.0], [46.6, 13783.0], [46.7, 13783.0], [46.8, 13783.0], [46.9, 13806.0], [47.0, 13806.0], [47.1, 13806.0], [47.2, 13816.0], [47.3, 13816.0], [47.4, 13816.0], [47.5, 13923.0], [47.6, 13923.0], [47.7, 13923.0], [47.8, 13993.0], [47.9, 13993.0], [48.0, 13993.0], [48.1, 13993.0], [48.2, 14368.0], [48.3, 14368.0], [48.4, 14368.0], [48.5, 14382.0], [48.6, 14382.0], [48.7, 14382.0], [48.8, 14647.0], [48.9, 14647.0], [49.0, 14647.0], [49.1, 14672.0], [49.2, 14672.0], [49.3, 14672.0], [49.4, 14697.0], [49.5, 14697.0], [49.6, 14697.0], [49.7, 14828.0], [49.8, 14828.0], [49.9, 14828.0], [50.0, 14828.0], [50.1, 14830.0], [50.2, 14830.0], [50.3, 14830.0], [50.4, 14862.0], [50.5, 14862.0], [50.6, 14862.0], [50.7, 15201.0], [50.8, 15201.0], [50.9, 15201.0], [51.0, 15280.0], [51.1, 15280.0], [51.2, 15280.0], [51.3, 15472.0], [51.4, 15472.0], [51.5, 15472.0], [51.6, 15546.0], [51.7, 15546.0], [51.8, 15546.0], [51.9, 15557.0], [52.0, 15557.0], [52.1, 15557.0], [52.2, 15557.0], [52.3, 15648.0], [52.4, 15648.0], [52.5, 15648.0], [52.6, 15674.0], [52.7, 15674.0], [52.8, 15674.0], [52.9, 15701.0], [53.0, 15701.0], [53.1, 15701.0], [53.2, 15785.0], [53.3, 15785.0], [53.4, 15785.0], [53.5, 16149.0], [53.6, 16149.0], [53.7, 16149.0], [53.8, 16175.0], [53.9, 16175.0], [54.0, 16175.0], [54.1, 16255.0], [54.2, 16255.0], [54.3, 16255.0], [54.4, 16255.0], [54.5, 16314.0], [54.6, 16314.0], [54.7, 16314.0], [54.8, 16391.0], [54.9, 16391.0], [55.0, 16391.0], [55.1, 16551.0], [55.2, 16551.0], [55.3, 16551.0], [55.4, 16682.0], [55.5, 16682.0], [55.6, 16682.0], [55.7, 16866.0], [55.8, 16866.0], [55.9, 16866.0], [56.0, 16871.0], [56.1, 16871.0], [56.2, 16871.0], [56.3, 16995.0], [56.4, 16995.0], [56.5, 16995.0], [56.6, 16995.0], [56.7, 17004.0], [56.8, 17004.0], [56.9, 17004.0], [57.0, 17111.0], [57.1, 17111.0], [57.2, 17111.0], [57.3, 17270.0], [57.4, 17270.0], [57.5, 17270.0], [57.6, 17453.0], [57.7, 17453.0], [57.8, 17453.0], [57.9, 17495.0], [58.0, 17495.0], [58.1, 17495.0], [58.2, 17725.0], [58.3, 17725.0], [58.4, 17725.0], [58.5, 17801.0], [58.6, 17801.0], [58.7, 17801.0], [58.8, 17801.0], [58.9, 17967.0], [59.0, 17967.0], [59.1, 17967.0], [59.2, 18280.0], [59.3, 18280.0], [59.4, 18280.0], [59.5, 18506.0], [59.6, 18506.0], [59.7, 18506.0], [59.8, 18556.0], [59.9, 18556.0], [60.0, 18556.0], [60.1, 19067.0], [60.2, 19067.0], [60.3, 19067.0], [60.4, 19120.0], [60.5, 19120.0], [60.6, 19120.0], [60.7, 19172.0], [60.8, 19172.0], [60.9, 19172.0], [61.0, 19172.0], [61.1, 19197.0], [61.2, 19197.0], [61.3, 19197.0], [61.4, 19295.0], [61.5, 19295.0], [61.6, 19295.0], [61.7, 19299.0], [61.8, 19299.0], [61.9, 19299.0], [62.0, 19375.0], [62.1, 19375.0], [62.2, 19375.0], [62.3, 19398.0], [62.4, 19398.0], [62.5, 19398.0], [62.6, 19616.0], [62.7, 19616.0], [62.8, 19616.0], [62.9, 19628.0], [63.0, 19628.0], [63.1, 19628.0], [63.2, 19628.0], [63.3, 19762.0], [63.4, 19762.0], [63.5, 19762.0], [63.6, 19821.0], [63.7, 19821.0], [63.8, 19821.0], [63.9, 20091.0], [64.0, 20091.0], [64.1, 20091.0], [64.2, 20296.0], [64.3, 20296.0], [64.4, 20296.0], [64.5, 20595.0], [64.6, 20595.0], [64.7, 20595.0], [64.8, 20667.0], [64.9, 20667.0], [65.0, 20667.0], [65.1, 20892.0], [65.2, 20892.0], [65.3, 20892.0], [65.4, 20892.0], [65.5, 21016.0], [65.6, 21016.0], [65.7, 21016.0], [65.8, 21043.0], [65.9, 21043.0], [66.0, 21043.0], [66.1, 21067.0], [66.2, 21067.0], [66.3, 21067.0], [66.4, 21114.0], [66.5, 21114.0], [66.6, 21114.0], [66.7, 21115.0], [66.8, 21115.0], [66.9, 21115.0], [67.0, 21250.0], [67.1, 21250.0], [67.2, 21250.0], [67.3, 21330.0], [67.4, 21330.0], [67.5, 21330.0], [67.6, 21330.0], [67.7, 21403.0], [67.8, 21403.0], [67.9, 21403.0], [68.0, 21633.0], [68.1, 21633.0], [68.2, 21633.0], [68.3, 21725.0], [68.4, 21725.0], [68.5, 21725.0], [68.6, 21733.0], [68.7, 21733.0], [68.8, 21733.0], [68.9, 22058.0], [69.0, 22058.0], [69.1, 22058.0], [69.2, 22247.0], [69.3, 22247.0], [69.4, 22247.0], [69.5, 22416.0], [69.6, 22416.0], [69.7, 22416.0], [69.8, 22416.0], [69.9, 22749.0], [70.0, 22749.0], [70.1, 22749.0], [70.2, 22762.0], [70.3, 22762.0], [70.4, 22762.0], [70.5, 23005.0], [70.6, 23005.0], [70.7, 23005.0], [70.8, 23015.0], [70.9, 23015.0], [71.0, 23015.0], [71.1, 23359.0], [71.2, 23359.0], [71.3, 23359.0], [71.4, 23372.0], [71.5, 23372.0], [71.6, 23372.0], [71.7, 23430.0], [71.8, 23430.0], [71.9, 23430.0], [72.0, 23430.0], [72.1, 23460.0], [72.2, 23460.0], [72.3, 23460.0], [72.4, 23504.0], [72.5, 23504.0], [72.6, 23504.0], [72.7, 23537.0], [72.8, 23537.0], [72.9, 23537.0], [73.0, 23722.0], [73.1, 23722.0], [73.2, 23722.0], [73.3, 24041.0], [73.4, 24041.0], [73.5, 24041.0], [73.6, 24109.0], [73.7, 24109.0], [73.8, 24109.0], [73.9, 24253.0], [74.0, 24253.0], [74.1, 24253.0], [74.2, 24253.0], [74.3, 24430.0], [74.4, 24430.0], [74.5, 24430.0], [74.6, 24582.0], [74.7, 24582.0], [74.8, 24582.0], [74.9, 24600.0], [75.0, 24600.0], [75.1, 24600.0], [75.2, 24663.0], [75.3, 24663.0], [75.4, 24663.0], [75.5, 24822.0], [75.6, 24822.0], [75.7, 24822.0], [75.8, 24868.0], [75.9, 24868.0], [76.0, 24868.0], [76.1, 24868.0], [76.2, 25007.0], [76.3, 25007.0], [76.4, 25007.0], [76.5, 25269.0], [76.6, 25269.0], [76.7, 25269.0], [76.8, 25410.0], [76.9, 25410.0], [77.0, 25410.0], [77.1, 25596.0], [77.2, 25596.0], [77.3, 25596.0], [77.4, 25797.0], [77.5, 25797.0], [77.6, 25797.0], [77.7, 25999.0], [77.8, 25999.0], [77.9, 25999.0], [78.0, 26081.0], [78.1, 26081.0], [78.2, 26081.0], [78.3, 26081.0], [78.4, 26517.0], [78.5, 26517.0], [78.6, 26517.0], [78.7, 26986.0], [78.8, 26986.0], [78.9, 26986.0], [79.0, 27270.0], [79.1, 27270.0], [79.2, 27270.0], [79.3, 27360.0], [79.4, 27360.0], [79.5, 27360.0], [79.6, 27370.0], [79.7, 27370.0], [79.8, 27370.0], [79.9, 27543.0], [80.0, 27543.0], [80.1, 27543.0], [80.2, 28077.0], [80.3, 28077.0], [80.4, 28077.0], [80.5, 28077.0], [80.6, 28279.0], [80.7, 28279.0], [80.8, 28279.0], [80.9, 28466.0], [81.0, 28466.0], [81.1, 28466.0], [81.2, 28589.0], [81.3, 28589.0], [81.4, 28589.0], [81.5, 28625.0], [81.6, 28625.0], [81.7, 28625.0], [81.8, 28765.0], [81.9, 28765.0], [82.0, 28765.0], [82.1, 28779.0], [82.2, 28779.0], [82.3, 28779.0], [82.4, 28790.0], [82.5, 28790.0], [82.6, 28790.0], [82.7, 28790.0], [82.8, 28941.0], [82.9, 28941.0], [83.0, 28941.0], [83.1, 29127.0], [83.2, 29127.0], [83.3, 29127.0], [83.4, 29165.0], [83.5, 29165.0], [83.6, 29165.0], [83.7, 29239.0], [83.8, 29239.0], [83.9, 29239.0], [84.0, 29267.0], [84.1, 29267.0], [84.2, 29267.0], [84.3, 29320.0], [84.4, 29320.0], [84.5, 29320.0], [84.6, 29390.0], [84.7, 29390.0], [84.8, 29390.0], [84.9, 29390.0], [85.0, 29394.0], [85.1, 29394.0], [85.2, 29394.0], [85.3, 29768.0], [85.4, 29768.0], [85.5, 29768.0], [85.6, 29821.0], [85.7, 29821.0], [85.8, 29821.0], [85.9, 29821.0], [86.0, 29821.0], [86.1, 29821.0], [86.2, 29857.0], [86.3, 29857.0], [86.4, 29857.0], [86.5, 30005.0], [86.6, 30005.0], [86.7, 30005.0], [86.8, 30006.0], [86.9, 30006.0], [87.0, 30006.0], [87.1, 30006.0], [87.2, 30015.0], [87.3, 30015.0], [87.4, 30015.0], [87.5, 30051.0], [87.6, 30051.0], [87.7, 30051.0], [87.8, 30053.0], [87.9, 30053.0], [88.0, 30053.0], [88.1, 30053.0], [88.2, 30053.0], [88.3, 30053.0], [88.4, 30054.0], [88.5, 30054.0], [88.6, 30054.0], [88.7, 30054.0], [88.8, 30054.0], [88.9, 30054.0], [89.0, 30054.0], [89.1, 30054.0], [89.2, 30054.0], [89.3, 30054.0], [89.4, 30055.0], [89.5, 30055.0], [89.6, 30055.0], [89.7, 30055.0], [89.8, 30055.0], [89.9, 30055.0], [90.0, 30055.0], [90.1, 30055.0], [90.2, 30055.0], [90.3, 30056.0], [90.4, 30056.0], [90.5, 30056.0], [90.6, 30056.0], [90.7, 30056.0], [90.8, 30056.0], [90.9, 30056.0], [91.0, 30056.0], [91.1, 30056.0], [91.2, 30056.0], [91.3, 30056.0], [91.4, 30056.0], [91.5, 30056.0], [91.6, 30057.0], [91.7, 30057.0], [91.8, 30057.0], [91.9, 30057.0], [92.0, 30057.0], [92.1, 30057.0], [92.2, 30058.0], [92.3, 30058.0], [92.4, 30058.0], [92.5, 30059.0], [92.6, 30059.0], [92.7, 30059.0], [92.8, 30059.0], [92.9, 30059.0], [93.0, 30059.0], [93.1, 30059.0], [93.2, 30059.0], [93.3, 30059.0], [93.4, 30059.0], [93.5, 30059.0], [93.6, 30059.0], [93.7, 30059.0], [93.8, 30060.0], [93.9, 30060.0], [94.0, 30060.0], [94.1, 30061.0], [94.2, 30061.0], [94.3, 30061.0], [94.4, 30061.0], [94.5, 30061.0], [94.6, 30061.0], [94.7, 30062.0], [94.8, 30062.0], [94.9, 30062.0], [95.0, 30062.0], [95.1, 30062.0], [95.2, 30062.0], [95.3, 30063.0], [95.4, 30063.0], [95.5, 30063.0], [95.6, 30064.0], [95.7, 30064.0], [95.8, 30064.0], [95.9, 30064.0], [96.0, 30065.0], [96.1, 30065.0], [96.2, 30065.0], [96.3, 30065.0], [96.4, 30065.0], [96.5, 30065.0], [96.6, 30066.0], [96.7, 30066.0], [96.8, 30066.0], [96.9, 30066.0], [97.0, 30066.0], [97.1, 30066.0], [97.2, 30066.0], [97.3, 30066.0], [97.4, 30066.0], [97.5, 30069.0], [97.6, 30069.0], [97.7, 30069.0], [97.8, 30069.0], [97.9, 30069.0], [98.0, 30069.0], [98.1, 30069.0], [98.2, 30070.0], [98.3, 30070.0], [98.4, 30070.0], [98.5, 30077.0], [98.6, 30077.0], [98.7, 30077.0], [98.8, 30078.0], [98.9, 30078.0], [99.0, 30078.0], [99.1, 30078.0], [99.2, 30078.0], [99.3, 30078.0], [99.4, 30082.0], [99.5, 30082.0], [99.6, 30082.0], [99.7, 30107.0], [99.8, 30107.0], [99.9, 30107.0], [100.0, 30107.0]], "isOverall": false, "label": "POST /purchases", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 42.0, "series": [{"data": [[0.0, 1.0], [900.0, 2.0], [1000.0, 2.0], [1100.0, 1.0], [1200.0, 1.0], [1300.0, 1.0], [1400.0, 2.0], [1500.0, 5.0], [1600.0, 3.0], [1700.0, 1.0], [1800.0, 2.0], [2000.0, 4.0], [2200.0, 3.0], [2300.0, 1.0], [2400.0, 2.0], [2600.0, 2.0], [2800.0, 2.0], [2900.0, 2.0], [3000.0, 3.0], [3100.0, 3.0], [3200.0, 1.0], [3500.0, 2.0], [3700.0, 1.0], [3600.0, 4.0], [3800.0, 1.0], [3900.0, 2.0], [4000.0, 2.0], [4300.0, 2.0], [4100.0, 1.0], [4500.0, 2.0], [4700.0, 1.0], [4900.0, 2.0], [5100.0, 1.0], [5000.0, 3.0], [5300.0, 1.0], [5600.0, 2.0], [5800.0, 2.0], [6000.0, 2.0], [5900.0, 1.0], [6200.0, 1.0], [6400.0, 2.0], [6500.0, 1.0], [6900.0, 1.0], [6800.0, 2.0], [7000.0, 1.0], [7600.0, 2.0], [7500.0, 2.0], [7700.0, 3.0], [7900.0, 1.0], [7800.0, 1.0], [8000.0, 1.0], [8400.0, 2.0], [8200.0, 1.0], [8500.0, 1.0], [9200.0, 1.0], [9600.0, 3.0], [9300.0, 1.0], [9500.0, 1.0], [10100.0, 1.0], [9900.0, 2.0], [10200.0, 1.0], [10000.0, 2.0], [10300.0, 2.0], [10500.0, 2.0], [10600.0, 2.0], [10700.0, 2.0], [11200.0, 1.0], [10800.0, 1.0], [11000.0, 1.0], [11400.0, 2.0], [11700.0, 3.0], [11300.0, 1.0], [11600.0, 1.0], [11500.0, 1.0], [12000.0, 1.0], [11900.0, 3.0], [11800.0, 2.0], [12200.0, 1.0], [12100.0, 1.0], [12600.0, 2.0], [12900.0, 5.0], [13300.0, 1.0], [13400.0, 1.0], [13500.0, 1.0], [13700.0, 1.0], [13800.0, 2.0], [13600.0, 1.0], [14300.0, 2.0], [13900.0, 2.0], [14600.0, 3.0], [14800.0, 3.0], [15200.0, 2.0], [15700.0, 2.0], [15500.0, 2.0], [15400.0, 1.0], [15600.0, 2.0], [16100.0, 2.0], [16300.0, 2.0], [16200.0, 1.0], [16900.0, 1.0], [16800.0, 2.0], [17200.0, 1.0], [16500.0, 1.0], [16600.0, 1.0], [17400.0, 2.0], [17100.0, 1.0], [17000.0, 1.0], [17900.0, 1.0], [17800.0, 1.0], [18200.0, 1.0], [17700.0, 1.0], [18500.0, 2.0], [19200.0, 2.0], [19000.0, 1.0], [19100.0, 3.0], [19300.0, 2.0], [19600.0, 2.0], [20200.0, 1.0], [19800.0, 1.0], [20000.0, 1.0], [19700.0, 1.0], [21000.0, 3.0], [21300.0, 1.0], [21400.0, 1.0], [21100.0, 2.0], [20500.0, 1.0], [20800.0, 1.0], [20600.0, 1.0], [21200.0, 1.0], [22000.0, 1.0], [21700.0, 2.0], [21600.0, 1.0], [22400.0, 1.0], [22200.0, 1.0], [22700.0, 2.0], [23000.0, 2.0], [23500.0, 2.0], [23400.0, 2.0], [23300.0, 2.0], [24000.0, 1.0], [24500.0, 1.0], [24400.0, 1.0], [23700.0, 1.0], [24200.0, 1.0], [24100.0, 1.0], [25500.0, 1.0], [24800.0, 2.0], [24600.0, 2.0], [25400.0, 1.0], [25200.0, 1.0], [25000.0, 1.0], [25900.0, 1.0], [26000.0, 1.0], [26500.0, 1.0], [25700.0, 1.0], [27500.0, 1.0], [27300.0, 2.0], [27200.0, 1.0], [26900.0, 1.0], [28400.0, 1.0], [28000.0, 1.0], [28500.0, 1.0], [28600.0, 1.0], [28200.0, 1.0], [29300.0, 3.0], [28900.0, 1.0], [28700.0, 3.0], [29200.0, 2.0], [29100.0, 2.0], [30000.0, 42.0], [29800.0, 3.0], [29700.0, 1.0], [30100.0, 1.0]], "isOverall": false, "label": "POST /purchases", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 30100.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 9.0, "minX": 1.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 265.0, "series": [{"data": [[1.0, 9.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[3.0, 44.0]], "isOverall": false, "label": "Requests in error", "isController": false}, {"data": [[2.0, 265.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 3.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 22.172839506172835, "minX": 1.53479796E12, "maxY": 48.55782312925171, "series": [{"data": [[1.53479796E12, 22.172839506172835], [1.53479808E12, 36.388888888888886], [1.53479802E12, 48.55782312925171]], "isOverall": false, "label": "Point of Sales API", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.53479808E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 3846.0, "minX": 1.0, "maxY": 30058.0, "series": [{"data": [[2.0, 11922.0], [3.0, 15632.0], [4.0, 10452.333333333334], [5.0, 15259.5], [6.0, 17498.5], [7.0, 30057.0], [8.0, 30058.0], [9.0, 11455.5], [10.0, 11690.333333333334], [11.0, 9218.0], [12.0, 5896.666666666666], [13.0, 6013.75], [14.0, 9442.5], [15.0, 8415.57142857143], [16.0, 16054.5], [17.0, 8810.5], [18.0, 7101.0], [19.0, 9922.6], [20.0, 13385.0], [21.0, 10515.666666666666], [22.0, 9360.0], [23.0, 9760.4], [24.0, 11808.666666666666], [25.0, 8913.6], [26.0, 6833.0], [27.0, 17476.0], [28.0, 12032.0], [29.0, 8634.0], [30.0, 11128.4], [31.0, 23425.25], [32.0, 22547.5], [33.0, 12278.5], [34.0, 18420.5], [35.0, 6810.0], [36.0, 13318.0], [37.0, 10875.571428571428], [38.0, 8676.75], [39.0, 17056.0], [40.0, 28708.0], [41.0, 15985.333333333332], [42.0, 11130.75], [43.0, 15320.0], [44.0, 20474.8], [45.0, 3846.0], [46.0, 11919.666666666666], [47.0, 10764.333333333334], [48.0, 11060.0], [49.0, 17495.0], [50.0, 19332.816993464046], [1.0, 24109.0]], "isOverall": false, "label": "POST /purchases", "isController": false}, {"data": [[38.39308176100629, 15681.767295597489]], "isOverall": false, "label": "POST /purchases-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 50.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 598.05, "minX": 1.53479796E12, "maxY": 4752.3, "series": [{"data": [[1.53479796E12, 598.05], [1.53479808E12, 679.75], [1.53479802E12, 1145.2333333333333]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.53479796E12, 2636.55], [1.53479808E12, 2929.5], [1.53479802E12, 4752.3]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.53479808E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 6574.086419753086, "minX": 1.53479796E12, "maxY": 20645.066666666666, "series": [{"data": [[1.53479796E12, 6574.086419753086], [1.53479808E12, 20645.066666666666], [1.53479802E12, 17661.530612244896]], "isOverall": false, "label": "POST /purchases", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.53479808E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 6574.037037037036, "minX": 1.53479796E12, "maxY": 20645.055555555555, "series": [{"data": [[1.53479796E12, 6574.037037037036], [1.53479808E12, 20645.055555555555], [1.53479802E12, 17661.027210884346]], "isOverall": false, "label": "POST /purchases", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.53479808E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 46.358024691358025, "minX": 1.53479796E12, "maxY": 57.8777777777778, "series": [{"data": [[1.53479796E12, 46.358024691358025], [1.53479808E12, 57.8777777777778], [1.53479802E12, 54.46938775510206]], "isOverall": false, "label": "POST /purchases", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.53479808E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 964.0, "minX": 1.53479796E12, "maxY": 29857.0, "series": [{"data": [[1.53479796E12, 28466.0], [1.53479808E12, 29857.0], [1.53479802E12, 29821.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.53479796E12, 964.0], [1.53479808E12, 1693.0], [1.53479802E12, 2032.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.53479796E12, 15366.199999999997], [1.53479808E12, 26040.0], [1.53479802E12, 23460.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.53479796E12, 28466.0], [1.53479808E12, 29821.0], [1.53479802E12, 29768.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.53479796E12, 22436.899999999972], [1.53479808E12, 28781.75], [1.53479802E12, 27543.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.53479808E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 12129.5, "minX": 1.0, "maxY": 30059.0, "series": [{"data": [[1.0, 12129.5], [2.0, 13390.5]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[2.0, 30059.0], [1.0, 30059.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 2.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 12129.5, "minX": 1.0, "maxY": 30059.0, "series": [{"data": [[1.0, 12129.5], [2.0, 13390.5]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[2.0, 30059.0], [1.0, 30059.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 2.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 0.6666666666666666, "minX": 1.53479796E12, "maxY": 2.6666666666666665, "series": [{"data": [[1.53479796E12, 1.9666666666666666], [1.53479808E12, 0.6666666666666666], [1.53479802E12, 2.6666666666666665]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.53479808E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 0.016666666666666666, "minX": 1.53479796E12, "maxY": 1.9666666666666666, "series": [{"data": [[1.53479796E12, 1.35], [1.53479808E12, 1.25], [1.53479802E12, 1.9666666666666666]], "isOverall": false, "label": "200", "isController": false}, {"data": [[1.53479808E12, 0.25], [1.53479802E12, 0.4666666666666667]], "isOverall": false, "label": "502", "isController": false}, {"data": [[1.53479802E12, 0.016666666666666666]], "isOverall": false, "label": "Non HTTP response code: java.net.SocketException", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.53479808E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 0.25, "minX": 1.53479796E12, "maxY": 1.9666666666666666, "series": [{"data": [[1.53479796E12, 1.35], [1.53479808E12, 1.25], [1.53479802E12, 1.9666666666666666]], "isOverall": false, "label": "POST /purchases-success", "isController": false}, {"data": [[1.53479808E12, 0.25], [1.53479802E12, 0.48333333333333334]], "isOverall": false, "label": "POST /purchases-failure", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.53479808E12, "title": "Transactions Per Second"}},
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
