import WidgetKit
import SwiftUI

struct XRPEntry: TimelineEntry {
    let date: Date
    let currencyCode: String
    let symbol: String
    let price: Double
    let change24h: Double
    let high24h: Double
    let low24h: Double
    let sparkline: [Double]
}

struct BinanceTicker: Decodable {
    let lastPrice: String
    let priceChangePercent: String
    let highPrice: String
    let lowPrice: String
}

struct OpenErResponse: Decodable {
    let rates: [String: Double]
}

struct XRPProvider: TimelineProvider {
    let currencyCode: String
    let symbol: String
    let fallbackRate: Double

    func placeholder(in context: Context) -> XRPEntry {
        XRPEntry(
            date: Date(),
            currencyCode: currencyCode,
            symbol: symbol,
            price: 1.34 * fallbackRate,
            change24h: 2.84,
            high24h: 1.38 * fallbackRate,
            low24h: 1.29 * fallbackRate,
            sparkline: [1.30, 1.31, 1.29, 1.32, 1.33, 1.31, 1.34, 1.35, 1.34]
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (XRPEntry) -> Void) {
        fetchLiveEntry { entry in
            completion(entry)
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<XRPEntry>) -> Void) {
        fetchLiveEntry { entry in
            let nextUpdate = Calendar.current.date(byAdding: .minute, value: 5, to: Date()) ?? Date().addingTimeInterval(300)
            completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
        }
    }

    private func fetchLiveEntry(completion: @escaping (XRPEntry) -> Void) {
        Task {
            var rate = fallbackRate
            if currencyCode != "USD", let fxURL = URL(string: "https://open.er-api.com/v6/latest/USD") {
                if let (fxData, _) = try? await URLSession.shared.data(from: fxURL),
                   let fxDecoded = try? JSONDecoder().decode(OpenErResponse.self, from: fxData),
                   let r = fxDecoded.rates[currencyCode] {
                    rate = r
                }
            }

            var priceUsd = 1.34
            var changePct = 2.75
            var highUsd = 1.37
            var lowUsd = 1.29

            if let tURL = URL(string: "https://api.binance.com/api/v3/ticker/24hr?symbol=XRPUSDT"),
               let (tData, _) = try? await URLSession.shared.data(from: tURL),
               let ticker = try? JSONDecoder().decode(BinanceTicker.self, from: tData) {
                priceUsd = Double(ticker.lastPrice) ?? priceUsd
                changePct = Double(ticker.priceChangePercent) ?? changePct
                highUsd = Double(ticker.highPrice) ?? highUsd
                lowUsd = Double(ticker.lowPrice) ?? lowUsd
            }

            var points: [Double] = []
            if let kURL = URL(string: "https://api.binance.com/api/v3/klines?symbol=XRPUSDT&interval=1h&limit=24"),
               let (kData, _) = try? await URLSession.shared.data(from: kURL),
               let rawArr = try? JSONSerialization.jsonObject(with: kData) as? [[Any]] {
                for item in rawArr {
                    if item.count > 4, let closeStr = item[4] as? String, let c = Double(closeStr) {
                        points.append(c * rate)
                    }
                }
            }
            if points.count < 2 {
                points = [lowUsd * rate, ((lowUsd + highUsd) / 2.0) * rate, priceUsd * rate]
            }

            let entry = XRPEntry(
                date: Date(),
                currencyCode: currencyCode,
                symbol: symbol,
                price: priceUsd * rate,
                change24h: changePct,
                high24h: highUsd * rate,
                low24h: lowUsd * rate,
                sparkline: points
            )
            completion(entry)
        }
    }
}

struct SparklineShape: Shape {
    let points: [Double]

    func path(in rect: CGRect) -> Path {
        var path = Path()
        guard points.count > 1 else { return path }
        let minVal = points.min() ?? 0
        let maxVal = points.max() ?? 1
        let span = max(maxVal - minVal, 0.0001)

        for (index, val) in points.enumerated() {
            let x = rect.minX + CGFloat(index) / CGFloat(points.count - 1) * rect.width
            let y = rect.maxY - CGFloat((val - minVal) / span) * rect.height
            if index == 0 {
                path.move(to: CGPoint(x: x, y: y))
            } else {
                path.addLine(to: CGPoint(x: x, y: y))
            }
        }
        return path
    }
}

struct XRPWidgetView: View {
    var entry: XRPEntry
    @Environment(\.widgetFamily) var family

    private var isUp: Bool { entry.change24h >= 0 }
    private var changeColor: Color {
        isUp ? Color(red: 46/255, green: 204/255, blue: 113/255) : Color(red: 231/255, green: 76/255, blue: 60/255)
    }
    private var accentBlue: Color {
        Color(red: 12/255, green: 147/255, blue: 234/255)
    }
    private var darkBg: Color {
        Color(red: 28/255, green: 30/255, blue: 35/255)
    }

    var body: some View {
        content
            .widgetBackground(darkBg)
    }

    @ViewBuilder
    private var content: some View {
        switch family {
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text("✕ XRP (\(entry.currencyCode))")
                        .font(.system(size: 11, weight: .bold))
                    Spacer()
                    Text(String(format: "%@%.2f%%", isUp ? "+" : "", entry.change24h))
                        .font(.system(size: 11, weight: .semibold))
                }
                Text(String(format: "%@%.4f", entry.symbol, entry.price))
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                Text(String(format: "H: %@%.3f  L: %@%.3f", entry.symbol, entry.high24h, entry.symbol, entry.low24h))
                    .font(.system(size: 10))
                    .opacity(0.8)
            }
        case .accessoryCircular:
            VStack(spacing: 1) {
                Text("XRP")
                    .font(.system(size: 10, weight: .bold))
                Text(String(format: "%.2f", entry.price))
                    .font(.system(size: 12, weight: .bold))
                Text(String(format: "%@%.1f%%", isUp ? "+" : "", entry.change24h))
                    .font(.system(size: 9))
            }
        case .systemMedium:
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 5) {
                        Text("✕ XRP ALERTS")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(accentBlue)
                        Text(entry.currencyCode)
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(.gray)
                    }
                    Text(String(format: "%@%.4f", entry.symbol, entry.price))
                        .font(.system(size: 26, weight: .light, design: .rounded))
                        .foregroundColor(.white)
                        .minimumScaleFactor(0.7)
                        .lineLimit(1)
                    Text(String(format: "%@%.2f%% (24h)", isUp ? "+" : "", entry.change24h))
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(changeColor)
                    Spacer(minLength: 2)
                    Text(String(format: "H: %@%.4f  •  L: %@%.4f", entry.symbol, entry.high24h, entry.symbol, entry.low24h))
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(Color(white: 0.65))
                        .lineLimit(1)
                }
                VStack(alignment: .trailing, spacing: 6) {
                    SparklineShape(points: entry.sparkline)
                        .stroke(accentBlue, style: StrokeStyle(lineWidth: 2.4, lineCap: .round, lineJoin: .round))
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .padding(.vertical, 6)
                    Text(entry.date, style: .time)
                        .font(.system(size: 9, weight: .medium))
                        .foregroundColor(.gray)
                }
                .frame(width: 120)
            }
            .padding(14)
        default:
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text("✕ XRP")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(accentBlue)
                    Spacer()
                    Text(entry.currencyCode)
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.gray)
                }
                Text(String(format: "%@%.4f", entry.symbol, entry.price))
                    .font(.system(size: 22, weight: .light, design: .rounded))
                    .foregroundColor(.white)
                    .minimumScaleFactor(0.65)
                    .lineLimit(1)
                Text(String(format: "%@%.2f%%", isUp ? "+" : "", entry.change24h))
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(changeColor)
                SparklineShape(points: entry.sparkline)
                    .stroke(accentBlue, style: StrokeStyle(lineWidth: 2.0, lineCap: .round, lineJoin: .round))
                    .frame(height: 26)
                    .padding(.vertical, 2)
                Text(String(format: "H:%@%.2f L:%@%.2f", entry.symbol, entry.high24h, entry.symbol, entry.low24h))
                    .font(.system(size: 9, weight: .medium))
                    .foregroundColor(Color(white: 0.65))
                    .lineLimit(1)
            }
            .padding(12)
        }
    }
}

extension View {
    @ViewBuilder
    func widgetBackground(_ color: Color) -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            self.containerBackground(for: .widget) {
                color
            }
        } else {
            self.background(color)
        }
    }
}

struct XRPWidgetEUR: Widget {
    let kind: String = "XRPWidgetEUR"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: XRPProvider(currencyCode: "EUR", symbol: "€", fallbackRate: 0.92)) { entry in
            XRPWidgetView(entry: entry)
        }
        .configurationDisplayName("XRP Price (EUR €)")
        .description("Live XRP price, 24h change, High/Low and 24h chart in Euro.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryCircular])
        .contentMarginsDisabledIfAvailable()
    }
}

struct XRPWidgetPLN: Widget {
    let kind: String = "XRPWidgetPLN"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: XRPProvider(currencyCode: "PLN", symbol: "zł", fallbackRate: 3.98)) { entry in
            XRPWidgetView(entry: entry)
        }
        .configurationDisplayName("XRP Price (PLN zł)")
        .description("Live XRP price, 24h change, High/Low and 24h chart in PLN.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryCircular])
        .contentMarginsDisabledIfAvailable()
    }
}

struct XRPWidgetUSD: Widget {
    let kind: String = "XRPWidgetUSD"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: XRPProvider(currencyCode: "USD", symbol: "$", fallbackRate: 1.0)) { entry in
            XRPWidgetView(entry: entry)
        }
        .configurationDisplayName("XRP Price (USD $)")
        .description("Live XRP price, 24h change, High/Low and 24h chart in USD.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryCircular])
        .contentMarginsDisabledIfAvailable()
    }
}

extension WidgetConfiguration {
    func contentMarginsDisabledIfAvailable() -> some WidgetConfiguration {
        if #available(iOSApplicationExtension 17.0, *) {
            return self.contentMarginsDisabled()
        } else {
            return self
        }
    }
}

@main
struct XRPWidgetsBundle: WidgetBundle {
    var body: some Widget {
        XRPWidgetEUR()
        XRPWidgetPLN()
        XRPWidgetUSD()
    }
}
