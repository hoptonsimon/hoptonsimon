"use strict";

export interface IconColors {
    sun: string;
    cloud: string;
    rain: string;
    text: string;
}

export type IconStyle = "colorful" | "monochrome" | "outlined" | "filled";

/**
 * Maps a condition string to a normalised key.
 * Handles common Weather API / OpenWeatherMap / AccuWeather condition strings.
 */
export function normaliseCondition(condition: string): string {
    if (!condition) return "cloudy";
    const c = condition.toLowerCase().trim();

    if (/thunder|lightning|storm|tsra/.test(c)) return "thunderstorm";
    if (/snow|blizzard|sleet|flurr/.test(c)) return "snow";
    if (/hail/.test(c)) return "hail";
    if (/drizzle|mist|shower/.test(c)) return "drizzle";
    if (/rain|rainy|wet/.test(c)) return "rain";
    if (/fog|haze/.test(c)) return "fog";
    if (/wind|breezy|blustery/.test(c)) return "wind";
    if (/partly.?cloud|mostly.?sun|partly.?sun/.test(c)) return "partly-cloudy";
    if (/overcast|mostly.?cloud/.test(c)) return "overcast";
    if (/cloud/.test(c)) return "cloudy";
    if (/clear|sun|fair/.test(c)) return "sunny";
    return "cloudy";
}

/**
 * Returns an SVG string for the given condition and style.
 */
export function getWeatherIcon(condition: string, style: IconStyle, colors: IconColors): string {
    const key = normaliseCondition(condition);
    const builders: Record<string, (s: IconStyle, c: IconColors) => string> = {
        "sunny": buildSunny,
        "partly-cloudy": buildPartlyCloudy,
        "cloudy": buildCloudy,
        "overcast": buildOvercast,
        "rain": buildRain,
        "drizzle": buildDrizzle,
        "thunderstorm": buildThunderstorm,
        "snow": buildSnow,
        "hail": buildHail,
        "fog": buildFog,
        "wind": buildWind,
    };
    const builder = builders[key] || buildCloudy;
    return builder(style, colors);
}

// ─── Helper: SVG wrapper ───────────────────────────────────────────────────────

function svg(content: string, viewBox = "0 0 64 64"): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100%" height="100%" fill="none">${content}</svg>`;
}

function sunRays(cx: number, cy: number, r: number, color: string, style: IconStyle): string {
    if (style === "outlined" || style === "monochrome") {
        return `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="${color}" stroke-width="2.5" fill="none"/>` + rays(cx, cy, r + 4, r + 10, 8, color, 2);
    }
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>` + rays(cx, cy, r + 4, r + 10, 8, color, 2.5);
}

function rays(cx: number, cy: number, r1: number, r2: number, count: number, color: string, sw: number): string {
    let out = "";
    for (let i = 0; i < count; i++) {
        const angle = (i * 360) / count;
        const rad = (angle * Math.PI) / 180;
        const x1 = cx + r1 * Math.cos(rad);
        const y1 = cy + r1 * Math.sin(rad);
        const x2 = cx + r2 * Math.cos(rad);
        const y2 = cy + r2 * Math.sin(rad);
        out += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>`;
    }
    return out;
}

function cloudShape(x: number, y: number, scale: number, color: string, style: IconStyle): string {
    // Cloud as a path scaled from a normalised base
    const s = scale;
    const path = `M${x + 12 * s},${y + 20 * s}
        a${8 * s},${8 * s} 0 0,1 0,-${16 * s}
        a${6 * s},${6 * s} 0 0,1 ${10 * s},-${4 * s}
        a${10 * s},${10 * s} 0 0,1 ${14 * s},${6 * s}
        a${6 * s},${6 * s} 0 0,1 ${2 * s},${14 * s}
        Z`;
    if (style === "outlined" || style === "monochrome") {
        return `<path d="${path}" stroke="${color}" stroke-width="2" fill="none" stroke-linejoin="round"/>`;
    }
    return `<path d="${path}" fill="${color}"/>`;
}

function rainDrops(startX: number, startY: number, count: number, color: string, style: IconStyle): string {
    let out = "";
    const sw = style === "outlined" ? 1.5 : 2;
    for (let i = 0; i < count; i++) {
        const x = startX + i * 10;
        const y = startY + (i % 2) * 6;
        out += `<line x1="${x}" y1="${y}" x2="${x - 3}" y2="${y + 8}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>`;
    }
    return out;
}

function snowFlakes(startX: number, startY: number, count: number, color: string): string {
    let out = "";
    for (let i = 0; i < count; i++) {
        const x = startX + i * 10;
        const y = startY + (i % 2) * 6;
        out += `<text x="${x}" y="${y}" font-size="10" fill="${color}" text-anchor="middle">❄</text>`;
    }
    return out;
}

// ─── Icon builders ─────────────────────────────────────────────────────────────

function buildSunny(style: IconStyle, c: IconColors): string {
    const sunC = style === "monochrome" ? c.text : c.sun;
    return svg(sunRays(32, 32, 14, sunC, style));
}

function buildPartlyCloudy(style: IconStyle, c: IconColors): string {
    const sunC = style === "monochrome" ? c.text : c.sun;
    const cloudC = style === "monochrome" ? c.text : c.cloud;
    return svg(
        sunRays(22, 22, 10, sunC, style) +
        cloudShape(4, 18, 0.9, cloudC, style)
    );
}

function buildCloudy(style: IconStyle, c: IconColors): string {
    const cloudC = style === "monochrome" ? c.text : c.cloud;
    return svg(cloudShape(2, 12, 1.1, cloudC, style));
}

function buildOvercast(style: IconStyle, c: IconColors): string {
    const cloudC = style === "monochrome" ? c.text :
        style === "filled" ? "#94a3b8" : c.cloud;
    return svg(
        cloudShape(2, 4, 1.0, cloudC, style) +
        cloudShape(6, 14, 0.95, cloudC, style)
    );
}

function buildRain(style: IconStyle, c: IconColors): string {
    const cloudC = style === "monochrome" ? c.text : c.cloud;
    const rainC = style === "monochrome" ? c.text : c.rain;
    return svg(
        cloudShape(2, 4, 1.0, cloudC, style) +
        rainDrops(16, 44, 4, rainC, style)
    );
}

function buildDrizzle(style: IconStyle, c: IconColors): string {
    const cloudC = style === "monochrome" ? c.text : c.cloud;
    const rainC = style === "monochrome" ? c.text : c.rain;
    return svg(
        cloudShape(2, 4, 1.0, cloudC, style) +
        rainDrops(20, 44, 3, rainC, style)
    );
}

function buildThunderstorm(style: IconStyle, c: IconColors): string {
    const cloudC = style === "monochrome" ? c.text : c.cloud;
    const rainC = style === "monochrome" ? c.text : c.rain;
    const boltColor = style === "monochrome" ? c.text :
        style === "filled" ? "#fde047" : "#fbbf24";
    const bolt = `<polygon points="34,24 26,38 32,38 28,52 42,34 35,34" fill="${boltColor}" ${style === "outlined" ? `stroke="${boltColor}" stroke-width="1" fill="none"` : ""}/>`;
    return svg(
        cloudShape(2, 4, 1.0, cloudC, style) +
        rainDrops(14, 44, 2, rainC, style) +
        bolt
    );
}

function buildSnow(style: IconStyle, c: IconColors): string {
    const cloudC = style === "monochrome" ? c.text : c.cloud;
    const snowC = style === "monochrome" ? c.text : c.rain;
    return svg(
        cloudShape(2, 4, 1.0, cloudC, style) +
        snowFlakes(18, 52, 4, snowC)
    );
}

function buildHail(style: IconStyle, c: IconColors): string {
    const cloudC = style === "monochrome" ? c.text : c.cloud;
    const hailC = style === "monochrome" ? c.text : c.rain;
    let dots = "";
    const positions = [[18, 48], [28, 52], [38, 48], [48, 52]];
    for (const [x, y] of positions) {
        if (style === "outlined") {
            dots += `<circle cx="${x}" cy="${y}" r="3.5" stroke="${hailC}" stroke-width="1.5" fill="none"/>`;
        } else {
            dots += `<circle cx="${x}" cy="${y}" r="3.5" fill="${hailC}"/>`;
        }
    }
    return svg(cloudShape(2, 4, 1.0, cloudC, style) + dots);
}

function buildFog(style: IconStyle, c: IconColors): string {
    const fogC = style === "monochrome" ? c.text : c.cloud;
    const sw = style === "outlined" ? 2 : 3;
    const lines = [
        `<line x1="10" y1="24" x2="54" y2="24" stroke="${fogC}" stroke-width="${sw}" stroke-linecap="round"/>`,
        `<line x1="16" y1="33" x2="48" y2="33" stroke="${fogC}" stroke-width="${sw}" stroke-linecap="round" opacity="0.75"/>`,
        `<line x1="10" y1="42" x2="54" y2="42" stroke="${fogC}" stroke-width="${sw}" stroke-linecap="round" opacity="0.5"/>`,
    ].join("");
    return svg(lines);
}

function buildWind(style: IconStyle, c: IconColors): string {
    const windC = style === "monochrome" ? c.text : c.cloud;
    const sw = style === "outlined" ? 2 : 2.5;
    const arcs = [
        `<path d="M10,28 Q32,14 46,28" stroke="${windC}" stroke-width="${sw}" fill="none" stroke-linecap="round"/>`,
        `<path d="M10,36 Q28,22 54,36" stroke="${windC}" stroke-width="${sw}" fill="none" stroke-linecap="round" opacity="0.8"/>`,
        `<path d="M10,44 Q24,30 44,44" stroke="${windC}" stroke-width="${sw}" fill="none" stroke-linecap="round" opacity="0.6"/>`,
    ].join("");
    return svg(arcs);
}

// ─── Precipitation icon (for detail rows) ─────────────────────────────────────

export function getPrecipitationIcon(color: string): string {
    return svg(`<path d="M32,10 Q42,26 42,36 a10,10 0 0,1 -20,0 Q22,26 32,10Z" fill="${color}"/>`, "0 0 64 64");
}

export function getHumidityIcon(color: string): string {
    return svg(`<circle cx="32" cy="32" r="14" stroke="${color}" stroke-width="2.5" fill="none"/>
    <path d="M32,20 v12 M32,32 h8" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`, "0 0 64 64");
}

export function getWindIcon(color: string): string {
    return svg(`<path d="M8,28 Q24,18 40,28 Q48,34 56,28" stroke="${color}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M8,36 Q20,26 48,36" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.7"/>`, "0 0 64 64");
}
