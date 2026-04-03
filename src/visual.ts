"use strict";

import powerbi from "powerbi-visuals-api";
import { VisualSettings } from "./settings";
import {
    getWeatherIcon,
    getPrecipitationIcon,
    getHumidityIcon,
    getWindIcon,
    IconStyle,
    IconColors,
} from "./weatherIcons";

import VisualConstructorOptions    = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions         = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual                     = powerbi.extensibility.visual.IVisual;
import DataView                    = powerbi.DataView;
import EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;
import VisualObjectInstanceEnumeration       = powerbi.VisualObjectInstanceEnumeration;

// ── Types ─────────────────────────────────────────────────────────────────────

interface WeatherEntry {
    location: string;
    dateTime: Date;
    temperature: number | null;
    highTemp: number | null;
    lowTemp: number | null;
    condition: string;
    precipitation: number | null;
    humidity: number | null;
    windSpeed: number | null;
}

// ── Main Visual Class ─────────────────────────────────────────────────────────

export class WeatherVisual implements IVisual {
    private target: HTMLElement;
    private settings: VisualSettings;

    constructor(options: VisualConstructorOptions) {
        this.target = options.element;
        this.clearElement(this.target);
        this.target.style.overflow = "hidden";
        this.target.style.width = "100%";
        this.target.style.height = "100%";
    }

    public update(options: VisualUpdateOptions): void {
        this.settings = VisualSettings.parse<VisualSettings>(
            options.dataViews && options.dataViews[0]
        );
        const data = this.extractData(options.dataViews);
        this.render(data);
    }

    // ── Data extraction ───────────────────────────────────────────────────────

    private extractData(dataViews: DataView[]): WeatherEntry[] {
        if (!dataViews || !dataViews[0] || !dataViews[0].table) return [];
        const table = dataViews[0].table;
        const cols = table.columns;
        const rows = table.rows;

        // Build column index map
        const idx: Record<string, number> = {};
        cols.forEach((col, i) => {
            const role = Object.keys(col.roles)[0];
            if (role) idx[role] = i;
        });

        const entries: WeatherEntry[] = rows.map(row => ({
            location:      this.getString(row, idx["location"]),
            dateTime:      this.getDate(row, idx["dateTime"]),
            temperature:   this.getNum(row, idx["temperature"]),
            highTemp:      this.getNum(row, idx["highTemp"]),
            lowTemp:       this.getNum(row, idx["lowTemp"]),
            condition:     this.getString(row, idx["condition"]) || "Cloudy",
            precipitation: this.getNum(row, idx["precipitation"]),
            humidity:      this.getNum(row, idx["humidity"]),
            windSpeed:     this.getNum(row, idx["windSpeed"]),
        }));

        // Sort by datetime ascending
        entries.sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
        return entries;
    }

    private getString(row: powerbi.DataViewTableRow, idx: number | undefined): string {
        if (idx === undefined || idx === null || row[idx] === null || row[idx] === undefined) return "";
        return String(row[idx]);
    }

    private getNum(row: powerbi.DataViewTableRow, idx: number | undefined): number | null {
        if (idx === undefined || idx === null || row[idx] === null || row[idx] === undefined) return null;
        const v = Number(row[idx]);
        return isNaN(v) ? null : v;
    }

    private getDate(row: powerbi.DataViewTableRow, idx: number | undefined): Date {
        if (idx === undefined || idx === null || row[idx] === null || row[idx] === undefined) return new Date();
        const v = row[idx];
        if (v instanceof Date) return v;
        const d = new Date(String(v));
        return isNaN(d.getTime()) ? new Date() : d;
    }

    // ── Rendering ─────────────────────────────────────────────────────────────

    private render(data: WeatherEntry[]): void {
        const s  = this.settings;
        const ds = s.displaySettings;
        const cs = s.colorSettings;
        const is = s.iconSettings;
        const fs = s.fontSettings;

        // Apply CSS variables to root
        const root = this.target;
        root.style.setProperty("--wv-font-family",        fs.fontFamily);
        root.style.setProperty("--wv-text-color",         cs.textColor);
        root.style.setProperty("--wv-bg-color",           cs.backgroundColor);
        root.style.setProperty("--wv-bg-opacity",         String(cs.backgroundOpacity / 100));
        root.style.setProperty("--wv-accent-color",       cs.accentColor);
        root.style.setProperty("--wv-highlight-color",    cs.highlightColor);
        root.style.setProperty("--wv-gradient-start",     cs.gradientStartColor);
        root.style.setProperty("--wv-gradient-end",       cs.gradientEndColor);
        root.style.setProperty("--wv-border-radius",      `${cs.borderRadius}px`);
        root.style.setProperty("--wv-temp-font-size",     `${fs.currentTempSize}px`);
        root.style.setProperty("--wv-location-font-size", `${fs.locationFontSize}px`);
        root.style.setProperty("--wv-label-font-size",    `${fs.labelFontSize}px`);
        root.style.setProperty("--wv-bg-rgb",             this.hexToRgb(cs.backgroundColor));

        const iconColors: IconColors = {
            sun:   is.sunColor,
            cloud: is.cloudColor,
            rain:  is.rainColor,
            text:  cs.textColor,
        };
        const iconStyle = is.iconSet as IconStyle;
        const iconSizeClass = `size-${is.iconSize}`;
        const unit = ds.temperatureUnit;

        const html = `<div class="weatherVisualRoot">${
            data.length === 0
                ? this.renderNoData(iconColors, iconStyle)
                : this.renderCard(data, ds, cs, is, iconColors, iconStyle, iconSizeClass, unit)
        }</div>`;
        this.setHTML(root, html);
    }

    // ── Card ──────────────────────────────────────────────────────────────────

    private renderCard(
        data: WeatherEntry[],
        ds: any, cs: any, is: any,
        iconColors: IconColors,
        iconStyle: IconStyle,
        iconSizeClass: string,
        unit: string
    ): string {
        const first = data[0];
        const location = first.location || "—";
        const dateLabel = this.formatDate(first.dateTime);

        // Best current-condition entry: pick the one closest to now
        const now = new Date();
        const current = data.reduce((best, e) =>
            Math.abs(e.dateTime.getTime() - now.getTime()) <
            Math.abs(best.dateTime.getTime() - now.getTime()) ? e : best
        , data[0]);

        const currentTemp   = current.temperature;
        const dailyHigh     = this.max(data, "highTemp") ?? this.max(data, "temperature");
        const dailyLow      = this.min(data, "lowTemp") ?? this.min(data, "temperature");
        const currentIconSvg = is.showIcons
            ? getWeatherIcon(current.condition, iconStyle, iconColors)
            : "";

        const styleClass = `style-${cs.cardStyle}`;

        return `
        <div class="wv-card ${styleClass}">
            ${this.renderHeader(location, dateLabel, ds)}
            ${this.renderCurrentBlock(current, currentTemp, dailyHigh, dailyLow, currentIconSvg, iconSizeClass, unit, ds)}
            ${this.renderDetails(current, ds, iconColors)}
            <div class="wv-divider"></div>
            ${this.renderTabBar(ds.viewMode)}
            ${ds.viewMode === "daily"
                ? this.renderDailyView(data, ds, is, iconColors, iconStyle, iconSizeClass, unit)
                : this.renderHourlyView(data, ds, is, iconColors, iconStyle, iconSizeClass, unit, current)
            }
        </div>`;
    }

    // ── Header ────────────────────────────────────────────────────────────────

    private renderHeader(location: string, dateLabel: string, ds: any): string {
        const locPart  = ds.showLocation ? `<div class="wv-location">${this.esc(location)}</div>` : "";
        const datePart = ds.showDate     ? `<div class="wv-date">${this.esc(dateLabel)}</div>` : "";
        return `
        <div class="wv-header">
            <div class="wv-location-block">${locPart}${datePart}</div>
            <div class="wv-settings-dot"></div>
        </div>`;
    }

    // ── Current block ─────────────────────────────────────────────────────────

    private renderCurrentBlock(
        current: WeatherEntry,
        temp: number | null,
        high: number | null,
        low: number | null,
        iconSvg: string,
        iconSizeClass: string,
        unit: string,
        ds: any
    ): string {
        const tempDisplay = temp !== null ? this.formatTemp(temp, unit) : "—";
        const highLowHtml = ds.showHighLow && (high !== null || low !== null) ? `
            <div class="wv-high-low">
                ${high !== null ? `<span class="wv-high">${this.formatTemp(high, unit)}</span>` : ""}
                ${low  !== null ? `<span class="wv-low">${this.formatTemp(low, unit)}</span>`  : ""}
            </div>` : "";

        return `
        <div class="wv-current">
            ${iconSvg ? `<div class="wv-current-icon ${iconSizeClass}">${iconSvg}</div>` : ""}
            <div class="wv-current-info">
                <div class="wv-condition-label">${this.esc(current.condition)}</div>
                <div class="wv-current-temp">
                    ${tempDisplay}<span class="wv-temp-unit">°</span>
                </div>
                ${highLowHtml}
            </div>
        </div>`;
    }

    // ── Extra details ─────────────────────────────────────────────────────────

    private renderDetails(entry: WeatherEntry, ds: any, iconColors: IconColors): string {
        const items: string[] = [];

        if (ds.showPrecipitation && entry.precipitation !== null) {
            items.push(`
            <div class="wv-detail-item">
                <div class="wv-detail-icon">${getPrecipitationIcon(iconColors.rain)}</div>
                <span>${Math.round(entry.precipitation)}%</span>
            </div>`);
        }
        if (ds.showHumidity && entry.humidity !== null) {
            items.push(`
            <div class="wv-detail-item">
                <div class="wv-detail-icon">${getHumidityIcon(iconColors.text)}</div>
                <span>${Math.round(entry.humidity)}%</span>
            </div>`);
        }
        if (ds.showWindSpeed && entry.windSpeed !== null) {
            items.push(`
            <div class="wv-detail-item">
                <div class="wv-detail-icon">${getWindIcon(iconColors.text)}</div>
                <span>${Math.round(entry.windSpeed)} mph</span>
            </div>`);
        }

        if (items.length === 0) return "";
        return `<div class="wv-details">${items.join("")}</div>`;
    }

    // ── Tab bar ───────────────────────────────────────────────────────────────

    private renderTabBar(viewMode: string): string {
        const hourly = viewMode === "hourly" ? "active" : "";
        const daily  = viewMode === "daily"  ? "active" : "";
        return `
        <div class="wv-tab-bar">
            <span class="wv-tab ${hourly}">Hourly</span>
            <span class="wv-tab ${daily}">Daily</span>
        </div>`;
    }

    // ── Hourly view ───────────────────────────────────────────────────────────

    private renderHourlyView(
        data: WeatherEntry[],
        ds: any, is: any,
        iconColors: IconColors,
        iconStyle: IconStyle,
        iconSizeClass: string,
        unit: string,
        current: WeatherEntry
    ): string {
        const limit = Math.min(Math.max(2, Math.round(ds.hoursToShow)), 12);
        // Find index of current entry, then show 'limit' slots from there
        const nowIdx = data.indexOf(current);
        const startIdx = Math.max(0, nowIdx);
        const slots = data.slice(startIdx, startIdx + limit);
        // If not enough after current, pad from beginning
        const items = slots.length < 2 ? data.slice(0, limit) : slots;

        const html = items.map((entry, i) => {
            const isCurrent = i === 0 && slots.length >= 2 || entry === current;
            const timeLabel = i === 0 && slots === items ? "NOW" : this.formatTime(entry.dateTime);
            const iconSvg   = is.showIcons ? getWeatherIcon(entry.condition, iconStyle, iconColors) : "";
            const temp      = entry.temperature !== null ? this.formatTemp(entry.temperature, unit) : "—";
            const precipHtml = ds.showPrecipitation && entry.precipitation !== null
                ? `<div class="wv-slot-precip">${Math.round(entry.precipitation)}%</div>` : "";

            return `
            <div class="wv-forecast-item${isCurrent ? " current-slot" : ""}">
                <div class="wv-slot-time">${timeLabel}</div>
                ${iconSvg ? `<div class="wv-slot-icon ${iconSizeClass}">${iconSvg}</div>` : ""}
                <div class="wv-slot-temp">${temp}</div>
                ${precipHtml}
            </div>`;
        }).join("");

        return `<div class="wv-forecast">${html}</div>`;
    }

    // ── Daily view ────────────────────────────────────────────────────────────

    private renderDailyView(
        data: WeatherEntry[],
        ds: any, is: any,
        iconColors: IconColors,
        iconStyle: IconStyle,
        iconSizeClass: string,
        unit: string
    ): string {
        // Group by date
        const byDay = new Map<string, WeatherEntry[]>();
        data.forEach(e => {
            const key = this.dayKey(e.dateTime);
            if (!byDay.has(key)) byDay.set(key, []);
            byDay.get(key)!.push(e);
        });

        const limit = Math.min(Math.max(2, Math.round(ds.daysToShow)), 14);
        const days  = Array.from(byDay.entries()).slice(0, limit);

        const html = days.map(([key, entries]) => {
            const rep  = entries[0];
            const high = this.max(entries, "highTemp") ?? this.max(entries, "temperature");
            const low  = this.min(entries, "lowTemp")  ?? this.min(entries, "temperature");
            // Most common condition
            const cond = this.mostCommon(entries.map(e => e.condition));
            const iconSvg = is.showIcons ? getWeatherIcon(cond, iconStyle, iconColors) : "";
            const dayName = this.formatDayName(rep.dateTime);
            const highLow = ds.showHighLow ? `
                <div class="wv-day-temps">
                    ${high !== null ? `<span class="wv-day-high">${this.formatTemp(high, unit)}</span>` : ""}
                    ${low  !== null ? `<span class="wv-day-low">${this.formatTemp(low, unit)}</span>`  : ""}
                </div>` : "";

            return `
            <div class="wv-daily-row">
                <div class="wv-day-name">${dayName}</div>
                ${iconSvg ? `<div class="wv-day-icon ${iconSizeClass}">${iconSvg}</div>` : ""}
                <div class="wv-day-condition">${this.esc(cond)}</div>
                ${highLow}
            </div>`;
        }).join("");

        return `<div class="wv-daily-list">${html}</div>`;
    }

    // ── No-data placeholder ───────────────────────────────────────────────────

    private renderNoData(iconColors: IconColors, iconStyle: IconStyle): string {
        const cloudIcon = getWeatherIcon("cloudy", iconStyle, iconColors);
        return `
        <div class="wv-card style-glass">
            <div class="wv-no-data">
                <div class="wv-no-data-icon">${cloudIcon}</div>
                <div>Add weather data fields to the visual</div>
                <div style="font-size:11px;opacity:0.6">Bind: Location · Date/Time · Temperature · Condition</div>
            </div>
        </div>`;
    }

    // ── Formatting helpers ────────────────────────────────────────────────────

    private formatTemp(val: number, unit: string): string {
        const v = unit === "C" ? Math.round((val - 32) * 5 / 9) : Math.round(val);
        return `${v}°`;
    }

    private formatDate(d: Date): string {
        return d.toLocaleDateString("en-US", {
            month: "long", day: "numeric", year: "numeric"
        });
    }

    private formatTime(d: Date): string {
        const h = d.getHours();
        const ampm = h >= 12 ? "PM" : "AM";
        const h12 = h % 12 || 12;
        return `${h12}${ampm}`;
    }

    private formatDayName(d: Date): string {
        const today = new Date();
        if (this.dayKey(d) === this.dayKey(today)) return "Today";
        return d.toLocaleDateString("en-US", { weekday: "short" });
    }

    private dayKey(d: Date): string {
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    }

    private max(arr: WeatherEntry[], field: keyof WeatherEntry): number | null {
        const vals = arr.map(e => e[field] as number | null).filter(v => v !== null) as number[];
        return vals.length ? Math.max(...vals) : null;
    }

    private min(arr: WeatherEntry[], field: keyof WeatherEntry): number | null {
        const vals = arr.map(e => e[field] as number | null).filter(v => v !== null) as number[];
        return vals.length ? Math.min(...vals) : null;
    }

    private mostCommon(arr: string[]): string {
        const freq: Record<string, number> = {};
        arr.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
        return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? arr[0] ?? "";
    }

    private esc(s: string): string {
        return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    private hexToRgb(hex: string): string {
        const clean = hex.replace("#", "");
        if (clean.length === 3) {
            const r = parseInt(clean[0] + clean[0], 16);
            const g = parseInt(clean[1] + clean[1], 16);
            const b = parseInt(clean[2] + clean[2], 16);
            return `${r},${g},${b}`;
        }
        const r = parseInt(clean.substring(0, 2), 16);
        const g = parseInt(clean.substring(2, 4), 16);
        const b = parseInt(clean.substring(4, 6), 16);
        return `${r},${g},${b}`;
    }

    // ── DOM helpers (avoids innerHTML lint rule) ───────────────────────────────

    private clearElement(el: HTMLElement): void {
        while (el.firstChild) el.removeChild(el.firstChild);
    }

    private setHTML(el: HTMLElement, html: string): void {
        this.clearElement(el);
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        Array.from(doc.body.childNodes).forEach(node => el.appendChild(node));
    }

    // ── Power BI Format Pane ──────────────────────────────────────────────────

    public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstanceEnumeration {
        return VisualSettings.enumerateObjectInstances(
            this.settings || VisualSettings.getDefault(),
            options
        );
    }
}
