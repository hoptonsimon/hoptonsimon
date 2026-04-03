# Power BI Weather Visual

A fully customisable Power BI custom visual that displays weather forecasts in a sleek glassmorphism card — supporting hourly and daily views with configurable icons, colors, and typography.

---

## Features

| Feature | Details |
|---|---|
| **Hourly view** | Current conditions + up to 12 hourly slots |
| **Daily view** | Up to 14-day forecast with high/low temps |
| **4 Icon Styles** | Colorful · Monochrome · Outlined · Filled |
| **4 Card Styles** | Glass (blur) · Solid · Gradient · Minimal |
| **Full color control** | Background, text, accent, gradient, sun/cloud/rain icon colors |
| **Font control** | Family, current temp size, label size |
| **Optional fields** | Precipitation · Humidity · Wind speed |
| **Temperature units** | Fahrenheit or Celsius |

---

## Data Fields

Bind columns from your data source to these roles in the Fields pane:

| Role | Type | Required | Description |
|---|---|---|---|
| **Location** | Text | Recommended | City/location name, e.g. `San Francisco` |
| **Date / Time** | Date/Time | Recommended | Datetime of each reading |
| **Temperature** | Number | Yes | Current temperature |
| **High Temperature** | Number | Optional | Daily high |
| **Low Temperature** | Number | Optional | Daily low |
| **Weather Condition** | Text | Recommended | e.g. `Sunny`, `Cloudy`, `Rainy` |
| **Precipitation (%)** | Number | Optional | Chance of rain/snow |
| **Humidity (%)** | Number | Optional | Relative humidity |
| **Wind Speed** | Number | Optional | mph or km/h |

### Supported Condition Strings

The visual automatically maps condition text to icons. Supported terms (case-insensitive):

`Sunny`, `Clear`, `Partly Cloudy`, `Mostly Sunny`, `Cloudy`, `Overcast`, `Mostly Cloudy`, `Drizzle`, `Shower`, `Rain`, `Rainy`, `Thunderstorm`, `Lightning`, `Storm`, `Snow`, `Blizzard`, `Sleet`, `Flurry`, `Hail`, `Fog`, `Haze`, `Wind`, `Breezy`, `Blustery`

---

## Setup & Build

### Prerequisites

```bash
node >= 18
npm >= 9
```

### Install

```bash
npm install
```

### Development server (live reload in Power BI Desktop)

```bash
npm run start
```

Then enable **Developer Visual** in Power BI Desktop:  
*File → Options → Security → Enable custom visual developer mode*

### Package for distribution

```bash
npm run build
```

This produces `dist/weatherVisual.pbiviz` which you can import into any Power BI workspace via *Get more visuals → Import from file*.

---

## Formatting Pane Reference

### Display
- **View Mode** – `Hourly` or `Daily`
- **Temperature Unit** – `°F` or `°C`
- **Hourly Slots to Show** – 2–12 (default 6)
- **Days to Show** – 2–14 (default 7)
- **Show Location / Date / High-Low / Precipitation / Humidity / Wind Speed** – toggle each on/off

### Colors
- **Background Color** + **Background Opacity** – card fill (used in Glass & Solid modes)
- **Text Color** – all text
- **Accent / Divider Color** – subtle separator lines
- **Current / Highlight Color** – active tab underline and selected slot
- **Card Style** – Glass · Solid · Gradient · Minimal
- **Gradient Start / End Color** – used when Card Style = Gradient
- **Corner Radius** – 0 (square) to 32 (very round)

### Icons
- **Show Weather Icons** – toggle icons on/off
- **Icon Style** – Colorful · Monochrome · Outlined · Filled
- **Icon Size** – Small · Medium · Large
- **Sun Color / Cloud Color / Rain Color** – fine-tune icon palette

### Font
- **Font Family** – Segoe UI · Arial · Helvetica · Georgia · Courier
- **Current Temp Font Size** – large temperature number (px)
- **Location Font Size** – city name (px)
- **Label Font Size** – time slots, condition labels, etc. (px)

---

## Data Source Examples

You can connect to weather data using Power Query from:
- **OpenWeatherMap API** (via Web connector)
- **WeatherAPI.com** (via Web connector)
- **Excel / SharePoint** flat file with historical weather data
- **Azure Data Factory** pipeline feeding a dataset

### Sample Power Query (OpenWeatherMap forecast)

```m
let
    ApiKey   = "YOUR_API_KEY",
    City     = "San Francisco",
    Url      = "https://api.openweathermap.org/data/2.5/forecast?q=" & City & "&appid=" & ApiKey & "&units=imperial",
    Raw      = Json.Document(Web.Contents(Url)),
    List     = Raw[list],
    Table    = Table.FromList(List, Splitter.SplitByNothing()),
    Expanded = Table.ExpandRecordColumn(Table, "Column1",
                   {"dt_txt","main","weather"},
                   {"DateTime","Main","Weather"}),
    WithTemp = Table.AddColumn(Expanded, "Temperature",
                   each [Main][temp], type number),
    WithHigh = Table.AddColumn(WithTemp, "HighTemp",
                   each [Main][temp_max], type number),
    WithLow  = Table.AddColumn(WithHigh, "LowTemp",
                   each [Main][temp_min], type number),
    WithCond = Table.AddColumn(WithLow, "Condition",
                   each [Weather]{0}[description], type text),
    WithLoc  = Table.AddColumn(WithCond, "Location",
                   each City, type text),
    Final    = Table.SelectColumns(WithLoc,
                   {"Location","DateTime","Temperature","HighTemp","LowTemp","Condition"})
in
    Final
```

---

## Project Structure

```
weather-visual/
├── src/
│   ├── visual.ts          # Main IVisual class — rendering & data binding
│   ├── settings.ts        # Formatting settings (DataViewObjectsParser)
│   └── weatherIcons.ts    # SVG icon builders for all conditions & styles
├── style/
│   └── visual.less        # Card layout, glassmorphism, forecast strips
├── assets/
│   └── icon.png           # Thumbnail shown in the Power BI visuals panel
├── capabilities.json      # Data roles & formatting property declarations
├── package.json
├── pbiviz.json            # Visual metadata & entry points
└── tsconfig.json
```
