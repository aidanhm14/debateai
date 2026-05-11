/* world-data.js
 *
 * Shared data layer for the world map / rotating globe modules.
 *   - LAND mask (compact ASCII grid → projected dot points)
 *   - CITIES list (lat/lng/count/major flag)
 *   - ARCS list (cross-region edges between major hubs)
 *
 * Loaded as a plain global so both /js/world-map.js and
 * /js/world-globe.js can share one truth. Dispatches a
 * 'world-data:ready' event after init so consumers waiting on it
 * (the globe mounts asynchronously via this signal) know to start.
 *
 * When the live ~28-day MAU snapshot moves materially, edit the
 * counts here in lockstep with the stats row in landing.html so the
 * map and the headline numbers agree.
 */

(function(global){
  'use strict';

  // 36 columns × 18 rows (10° resolution) ASCII land mask. "#" = land,
  // "." = ocean. Hand-drawn; rough is fine — the city pins carry the
  // real geographic load and edge fade hides the lo-res quality.
  var LAND_MASK = [
    '....................................', // 90N
    '....##.######.................######', // 80N
    '...####.#####################.######', // 70N
    '..######.######################.####', // 60N
    '..#######.######################.###', // 50N
    '...####.....##################...##.', // 40N
    '....##........############.##.......', // 30N
    '.....###....#################.......', // 20N
    '......##....##############..........', // 10N
    '.......##.....#######.####..........', // 0
    '........###.....#####.####..........', // 10S
    '.........###.....####.....##........', // 20S
    '..........##.....###......##........', // 30S
    '..........#.......#.......#.........', // 40S
    '....................................', // 50S
    '....................................', // 60S
    '########.#####################.#####', // 70S
    '####################################'  // 80S
  ];

  function buildLandPoints() {
    var rows = LAND_MASK.length;
    var cols = LAND_MASK[0].length;
    var cellLng = 360 / cols;
    var cellLat = 180 / rows;
    var pts = [];
    for (var r = 0; r < rows; r++) {
      var line = LAND_MASK[r];
      for (var c = 0; c < cols; c++) {
        if (line.charAt(c) !== '#') continue;
        pts.push({
          lng: -180 + (c + 0.5) * cellLng,
          lat:  90  - (r + 0.5) * cellLat,
        });
      }
    }
    return pts;
  }

  // Cities — calibrated to the live ~6,980 28-day MAU snapshot, India-
  // heavy per soul.md §8 (~80% Indian traffic). Edit in lockstep with
  // landing.html stats row when MAU moves materially.
  var CITIES = [
    // ── India ────────────────────────────────────────────
    { name:'Bengaluru',     lat:12.97, lng:77.59,  count:1100, major:true  },
    { name:'Delhi',         lat:28.61, lng:77.20,  count:850,  major:true  },
    { name:'Mumbai',        lat:19.07, lng:72.88,  count:700,  major:true  },
    { name:'Hyderabad',     lat:17.39, lng:78.49,  count:500,  major:true  },
    { name:'Chennai',       lat:13.08, lng:80.27,  count:450,  major:true  },
    { name:'Kolkata',       lat:22.57, lng:88.36,  count:320,  major:true  },
    { name:'Pune',          lat:18.52, lng:73.86,  count:280,  major:true  },
    { name:'Ahmedabad',     lat:23.03, lng:72.58,  count:200,  major:true  },
    { name:'Jaipur',        lat:26.91, lng:75.79,  count:150 },
    { name:'Lucknow',       lat:26.85, lng:80.95,  count:120 },
    { name:'Chandigarh',    lat:30.73, lng:76.78,  count:100 },
    { name:'Kochi',         lat:9.93,  lng:76.27,  count:90  },
    { name:'Indore',        lat:22.72, lng:75.86,  count:80  },
    { name:'Bhubaneswar',   lat:20.30, lng:85.82,  count:70  },
    { name:'Coimbatore',    lat:11.02, lng:76.96,  count:60  },
    { name:'Visakhapatnam', lat:17.69, lng:83.22,  count:50  },
    { name:'Patna',         lat:25.59, lng:85.14,  count:50  },
    // ── South Asia ───────────────────────────────────────
    { name:'Colombo',       lat:6.93,  lng:79.86,  count:60  },
    { name:'Dhaka',         lat:23.81, lng:90.41,  count:75  },
    { name:'Kathmandu',     lat:27.71, lng:85.32,  count:40  },
    // ── North America ────────────────────────────────────
    { name:'New York',      lat:40.71, lng:-74.01, count:240, major:true  },
    { name:'Boston',        lat:42.36, lng:-71.06, count:140 },
    { name:'San Francisco', lat:37.77, lng:-122.42,count:170 },
    { name:'Los Angeles',   lat:34.05, lng:-118.24,count:110 },
    { name:'Chicago',       lat:41.88, lng:-87.63, count:90  },
    { name:'Washington',    lat:38.91, lng:-77.04, count:90  },
    { name:'Seattle',       lat:47.61, lng:-122.33,count:55  },
    { name:'Toronto',       lat:43.65, lng:-79.38, count:120 },
    { name:'Vancouver',     lat:49.28, lng:-123.12,count:55  },
    { name:'Mexico City',   lat:19.43, lng:-99.13, count:50  },
    // ── Europe ───────────────────────────────────────────
    { name:'London',        lat:51.51, lng:-0.13,  count:200, major:true  },
    { name:'Paris',         lat:48.86, lng:2.35,   count:80  },
    { name:'Berlin',        lat:52.52, lng:13.40,  count:60  },
    { name:'Amsterdam',     lat:52.37, lng:4.90,   count:55  },
    { name:'Dublin',        lat:53.35, lng:-6.26,  count:45  },
    { name:'Madrid',        lat:40.42, lng:-3.70,  count:50  },
    { name:'Istanbul',      lat:41.01, lng:28.98,  count:60  },
    { name:'Stockholm',     lat:59.33, lng:18.07,  count:35  },
    { name:'Warsaw',        lat:52.23, lng:21.01,  count:30  },
    { name:'Athens',        lat:37.98, lng:23.73,  count:25  },
    // ── Middle East / Africa ─────────────────────────────
    { name:'Dubai',         lat:25.20, lng:55.27,  count:130, major:true  },
    { name:'Riyadh',        lat:24.71, lng:46.68,  count:55  },
    { name:'Doha',          lat:25.29, lng:51.53,  count:40  },
    { name:'Cairo',         lat:30.04, lng:31.24,  count:75  },
    { name:'Tel Aviv',      lat:32.08, lng:34.78,  count:40  },
    { name:'Lagos',         lat:6.52,  lng:3.38,   count:90  },
    { name:'Nairobi',       lat:-1.29, lng:36.82,  count:55  },
    { name:'Johannesburg',  lat:-26.20,lng:28.04,  count:65  },
    { name:'Accra',         lat:5.60,  lng:-0.19,  count:35  },
    // ── East / SE Asia / Oceania ─────────────────────────
    { name:'Singapore',     lat:1.35,  lng:103.81, count:120, major:true  },
    { name:'Tokyo',         lat:35.68, lng:139.69, count:75  },
    { name:'Hong Kong',     lat:22.32, lng:114.16, count:55  },
    { name:'Seoul',         lat:37.56, lng:126.97, count:45  },
    { name:'Shanghai',      lat:31.23, lng:121.47, count:40  },
    { name:'Manila',        lat:14.59, lng:120.97, count:80  },
    { name:'Kuala Lumpur',  lat:3.14,  lng:101.69, count:65  },
    { name:'Jakarta',       lat:-6.20, lng:106.85, count:75  },
    { name:'Bangkok',       lat:13.75, lng:100.50, count:55  },
    { name:'Sydney',        lat:-33.87,lng:151.21, count:130, major:true  },
    { name:'Melbourne',     lat:-37.81,lng:144.96, count:90  },
    { name:'Auckland',      lat:-36.85,lng:174.76, count:45  },
    // ── Latin America ────────────────────────────────────
    { name:'São Paulo',     lat:-23.55,lng:-46.63, count:80  },
    { name:'Buenos Aires',  lat:-34.61,lng:-58.38, count:55  },
    { name:'Bogotá',        lat:4.71,  lng:-74.07, count:45  },
    { name:'Santiago',      lat:-33.45,lng:-70.67, count:35  },
    { name:'Lima',          lat:-12.05,lng:-77.04, count:30  },
    { name:'Rio de Janeiro',lat:-22.91,lng:-43.17, count:50  }
  ];

  // Cross-region edges. major=true → brighter, thicker stroke.
  var ARCS = [
    { a:'Bengaluru',     b:'New York',    major:true  },
    { a:'Bengaluru',     b:'London',      major:true  },
    { a:'Mumbai',        b:'Dubai'                    },
    { a:'Delhi',         b:'Singapore'                },
    { a:'Chennai',       b:'Bengaluru'                },
    { a:'Hyderabad',     b:'Delhi'                    },
    { a:'New York',      b:'London'                   },
    { a:'San Francisco', b:'Tokyo'                    },
    { a:'Sydney',        b:'Singapore'                },
    { a:'Lagos',         b:'London'                   },
    { a:'São Paulo',     b:'New York'                 },
    { a:'Dubai',         b:'London'                   },
    { a:'Boston',        b:'Bengaluru',  major:true   },
    { a:'Singapore',     b:'Bengaluru'                }
  ];

  global.DebateWorldData = {
    cities: CITIES,
    arcs:   ARCS,
    land:   buildLandPoints(),
  };
  try {
    global.dispatchEvent(new Event('world-data:ready'));
  } catch(e) {
    // Old IE doesn't support `new Event()` — ignore. The globe also
    // checks DebateWorldData synchronously when mounted.
  }
})(window);
