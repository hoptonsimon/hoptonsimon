"use strict";

import { dataViewObjectsParser } from "powerbi-visuals-utils-dataviewutils";
import DataViewObjectsParser = dataViewObjectsParser.DataViewObjectsParser;

export class LocationSettings {
    public cityName: string = "London";
}

export class DisplaySettings {
    public viewMode: string = "hourly";
    public temperatureUnit: string = "C";
    public hoursToShow: number = 6;
    public daysToShow: number = 7;
    public showLocation: boolean = true;
    public showDate: boolean = true;
    public showHighLow: boolean = true;
    public showPrecipitation: boolean = true;
    public showHumidity: boolean = false;
    public showWindSpeed: boolean = false;
}

export class ColorSettings {
    public backgroundColor: string = "#3a5a8a";
    public backgroundOpacity: number = 80;
    public textColor: string = "#ffffff";
    public accentColor: string = "rgba(255,255,255,0.35)";
    public highlightColor: string = "#ffffff";
    public cardStyle: string = "glass";
    public gradientStartColor: string = "#3a5a8a";
    public gradientEndColor: string = "#7b4f9e";
    public borderRadius: number = 16;
}

export class IconSettings {
    public showIcons: boolean = true;
    public iconSet: string = "colorful";
    public iconSize: string = "medium";
    public sunColor: string = "#fbbf24";
    public cloudColor: string = "#e2e8f0";
    public rainColor: string = "#93c5fd";
}

export class FontSettings {
    public fontFamily: string = "Segoe UI, sans-serif";
    public currentTempSize: number = 64;
    public locationFontSize: number = 24;
    public labelFontSize: number = 13;
}

export class VisualSettings extends DataViewObjectsParser {
    public locationSettings: LocationSettings = new LocationSettings();
    public displaySettings: DisplaySettings = new DisplaySettings();
    public colorSettings: ColorSettings = new ColorSettings();
    public iconSettings: IconSettings = new IconSettings();
    public fontSettings: FontSettings = new FontSettings();
}
