import { EPSGDefinition } from './types';

// A subset of common coordinate systems. 
// In a production app, this would be fetched from epsg.io or a larger database.
export const COMMON_EPSG: EPSGDefinition[] = [
  {
    code: 'EPSG:32637',
    name: 'UTM Zone 37N (WGS84) - Western Saudi / Red Sea',
    def: '+proj=utm +zone=37 +datum=WGS84 +units=m +no_defs'
  },
  {
    code: 'EPSG:32638',
    name: 'UTM Zone 38N (WGS84) - Riyadh / Central Saudi',
    def: '+proj=utm +zone=38 +datum=WGS84 +units=m +no_defs'
  },
  {
    code: 'EPSG:20437',
    name: 'Ain el Abd / UTM Zone 37N (Old Saudi / MOMRA)',
    def: '+proj=utm +zone=37 +ellps=intl +towgs84=-143,-236,7,0,0,0,0 +units=m +no_defs'
  },
  {
    code: 'EPSG:20438',
    name: 'Ain el Abd / UTM Zone 38N (Old Riyadh / MOMRA)',
    def: '+proj=utm +zone=38 +ellps=intl +towgs84=-143,-236,7,0,0,0,0 +units=m +no_defs'
  },
  {
    code: 'EPSG:4326',
    name: 'WGS 84 (GPS / Google Earth)',
    def: '+proj=longlat +datum=WGS84 +no_defs'
  },
  {
    code: 'EPSG:3857',
    name: 'Web Mercator (Google Maps / Bing)',
    def: '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext  +no_defs'
  },
  {
    code: 'EPSG:32639',
    name: 'UTM Zone 39N (WGS84) - Eastern Province',
    def: '+proj=utm +zone=39 +datum=WGS84 +units=m +no_defs'
  },
  {
    code: 'EPSG:20439',
    name: 'Ain el Abd / UTM Zone 39N (Old Eastern)',
    def: '+proj=utm +zone=39 +ellps=intl +towgs84=-143,-236,7,0,0,0,0 +units=m +no_defs'
  },
  {
    code: 'EPSG:32636',
    name: 'UTM Zone 36N (WGS84)',
    def: '+proj=utm +zone=36 +datum=WGS84 +units=m +no_defs'
  },
  {
    code: 'EPSG:27700',
    name: 'OSGB36 / British National Grid',
    def: '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +datum=OSGB36 +units=m +no_defs'
  },
  {
    code: 'EPSG:2263',
    name: 'NAD83 / New York Long Island (ftUS)',
    def: '+proj=lcc +lat_1=41.03333333333333 +lat_2=40.66666666666666 +lat_0=40.16666666666666 +lon_0=-74 +x_0=300000.0000000001 +y_0=0 +ellps=GRS80 +datum=NAD83 +to_meter=0.3048006096012192 +no_defs'
  }
];

export const MAX_PREVIEW_ROWS = 5;