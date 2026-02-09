import SwiftUI

/// Scout logo as a native SwiftUI Shape - renders the teal scout icon
struct ScoutLogoShape: Shape {
    func path(in rect: CGRect) -> Path {
        // Original SVG viewBox: 188 x 184
        let scaleX = rect.width / 188
        let scaleY = rect.height / 184
        let scale = min(scaleX, scaleY)
        let offsetX = (rect.width - 188 * scale) / 2
        let offsetY = (rect.height - 184 * scale) / 2

        var path = Path()

        // Translated path from SVG (original transform was translate(83.79, 5.87))
        let tx: CGFloat = 83.79
        let ty: CGFloat = 5.87

        // Main outer shape
        path.move(to: scaled(x: 0 + tx, y: 0 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY))

        // Simplified path - outer boundary
        path.addCurve(
            to: scaled(x: -8.98 + tx, y: 1.49 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY),
            control1: scaled(x: -3.83 + tx, y: 0 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY),
            control2: scaled(x: -5.61 + tx, y: 0.94 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY)
        )

        path.addCurve(
            to: scaled(x: -52.79 + tx, y: 23.13 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY),
            control1: scaled(x: -25.13 + tx, y: 3.64 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY),
            control2: scaled(x: -39.66 + tx, y: 8.97 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY)
        )

        path.addCurve(
            to: scaled(x: -73.30 + tx, y: 89.25 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY),
            control1: scaled(x: -68.95 + tx, y: 47.48 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY),
            control2: scaled(x: -77.46 + tx, y: 71.19 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY)
        )

        path.addCurve(
            to: scaled(x: -68.79 + tx, y: 111.13 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY),
            control1: scaled(x: -72.79 + tx, y: 94.97 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY),
            control2: scaled(x: -70.00 + tx, y: 106.52 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY)
        )

        path.addCurve(
            to: scaled(x: -62.79 + tx, y: 126.13 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY),
            control1: scaled(x: -65.79 + tx, y: 121.13 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY),
            control2: scaled(x: -63.79 + tx, y: 122.13 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY)
        )

        path.addCurve(
            to: scaled(x: -12.79 + tx, y: 168.88 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY),
            control1: scaled(x: -51.42 + tx, y: 146.27 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY),
            control2: scaled(x: -35.04 + tx, y: 161.68 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY)
        )

        path.addCurve(
            to: scaled(x: 23.34 + tx, y: 172.44 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY),
            control1: scaled(x: -5.79 + tx, y: 171.13 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY),
            control2: scaled(x: 14.73 + tx, y: 174.22 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY)
        )

        path.addCurve(
            to: scaled(x: 46.47 + tx, y: 164.47 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY),
            control1: scaled(x: 31.53 + tx, y: 170.69 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY),
            control2: scaled(x: 39.02 + tx, y: 168.31 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY)
        )

        path.addCurve(
            to: scaled(x: 80.40 + tx, y: 122.25 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY),
            control1: scaled(x: 63.35 + tx, y: 155.25 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY),
            control2: scaled(x: 74.81 + tx, y: 140.54 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY)
        )

        path.addCurve(
            to: scaled(x: 84.53 + tx, y: 104.06 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY),
            control1: scaled(x: 82.21 + tx, y: 116.13 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY),
            control2: scaled(x: 84.46 + tx, y: 110.15 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY)
        )

        path.addCurve(
            to: scaled(x: 85.21 + tx, y: 29.13 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY),
            control1: scaled(x: 85.03 + tx, y: 50.64 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY),
            control2: scaled(x: 85.13 + tx, y: 39.88 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY)
        )

        path.addCurve(
            to: scaled(x: 81.21 + tx, y: 16.45 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY),
            control1: scaled(x: 83.21 + tx, y: 28.13 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY),
            control2: scaled(x: 82.88 + tx, y: 24.00 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY)
        )

        path.addCurve(
            to: scaled(x: 68.90 + tx, y: 3.88 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY),
            control1: scaled(x: 78.23 + tx, y: 10.18 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY),
            control2: scaled(x: 75.58 + tx, y: 6.40 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY)
        )

        path.addCurve(
            to: scaled(x: 57.21 + tx, y: 1.13 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY),
            control1: scaled(x: 66.21 + tx, y: 3.13 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY),
            control2: scaled(x: 58.73 + tx, y: 1.20 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY)
        )

        path.addCurve(
            to: scaled(x: 0 + tx, y: 0 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY),
            control1: scaled(x: 56.21 + tx, y: 0.13 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY),
            control2: scaled(x: 3.75 + tx, y: -0.01 + ty, scale: scale, offsetX: offsetX, offsetY: offsetY)
        )

        path.closeSubpath()

        return path
    }

    private func scaled(x: CGFloat, y: CGFloat, scale: CGFloat, offsetX: CGFloat, offsetY: CGFloat) -> CGPoint {
        CGPoint(x: x * scale + offsetX, y: y * scale + offsetY)
    }
}

/// A view that displays the Scout logo with the correct teal color
struct ScoutLogoView: View {
    var size: CGFloat = 80

    var body: some View {
        ScoutLogoShape()
            .fill(Color(red: 0.34, green: 0.75, blue: 0.73)) // #57C0BB
            .frame(width: size, height: size)
    }
}

#Preview {
    VStack(spacing: 20) {
        ScoutLogoView(size: 100)
        ScoutLogoView(size: 60)
        ScoutLogoView(size: 40)
    }
}
