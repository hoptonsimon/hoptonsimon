"use strict";

import { dataViewObjectsParser } from "powerbi-visuals-utils-dataviewutils";
import DataViewObjectsParser = dataViewObjectsParser.DataViewObjectsParser;

export class LocationSettings {
    public cityName: string = "London";
}

export class DisplaySettings {
    public viewMode: string = "hourly";
    public temperatureUnit: string = "C";
    public hoursToShow: number = 12;
    public daysToShow: number = 7;
    public showLocation: boolean = true;
    public showDate: boolean = true;
    public showHighLow: boolean = true;
    public showPrecipitation: boolean = true;
    public showHumidity: boolean = true;
    public showWindSpeed: boolean = true;
}

export class ColorSettings {
    public backgroundColor: string = "#1e2d14";
    public backgroundOpacity: number = 12;
    public textColor: string = "#ffffff";
    public accentColor: string = "rgba(255,255,255,0.20)";
    public highlightColor: string = "#ffffff";
    public cardStyle: string = "glass";
    public gradientStartColor: string = "#2d4020";
    public gradientEndColor: string = "#1a2818";
    public borderRadius: number = 20;
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
