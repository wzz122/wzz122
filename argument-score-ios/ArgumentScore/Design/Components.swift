import SwiftUI

// MARK: - 卡片容器

struct CardBackground: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(
                RoundedRectangle(cornerRadius: DS.Radius.card, style: .continuous)
                    .fill(DS.Palette.surface)
                    .overlay(
                        RoundedRectangle(cornerRadius: DS.Radius.card, style: .continuous)
                            .strokeBorder(DS.Palette.surfaceStroke, lineWidth: 1)
                    )
            )
    }
}

extension View {
    func cardStyle() -> some View {
        modifier(CardBackground())
    }
}

// MARK: - 主按钮

struct PrimaryButtonStyle: ButtonStyle {
    var tint: Color = DS.Palette.brandStart

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(.headline, design: .rounded))
            .foregroundStyle(Color.black.opacity(0.85))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(
                RoundedRectangle(cornerRadius: DS.Radius.button, style: .continuous)
                    .fill(tint)
            )
            .opacity(configuration.isPressed ? 0.75 : 1)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.8), value: configuration.isPressed)
    }
}

struct GhostButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(.subheadline, design: .rounded))
            .foregroundStyle(DS.Palette.textSecondary)
            .padding(.vertical, 10)
            .padding(.horizontal, 18)
            .background(
                Capsule().strokeBorder(DS.Palette.surfaceStroke, lineWidth: 1)
            )
            .opacity(configuration.isPressed ? 0.6 : 1)
    }
}

// MARK: - 评分圆环

struct ScoreRing: View {
    var score: Int
    var size: CGFloat = 168
    var lineWidth: CGFloat = 15
    var caption: String = "沟通总分"

    @State private var animatedFraction: CGFloat = 0

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.white.opacity(0.08), lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: animatedFraction)
                .stroke(
                    AngularGradient(
                        colors: [DS.Palette.brandStart, DS.Palette.brandEnd, DS.Palette.brandStart],
                        center: .center
                    ),
                    style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
            VStack(spacing: 2) {
                Text("\(score)")
                    .font(.system(size: size * 0.33, weight: .heavy, design: .rounded))
                    .foregroundStyle(DS.Palette.textPrimary)
                    .contentTransition(.numericText())
                Text(caption)
                    .font(.system(.caption, design: .rounded))
                    .foregroundStyle(DS.Palette.textSecondary)
            }
        }
        .frame(width: size, height: size)
        .onAppear {
            withAnimation(.spring(response: 1.1, dampingFraction: 0.85)) {
                animatedFraction = CGFloat(score) / 100
            }
        }
    }
}

// MARK: - 责任占比条

struct ResponsibilityBar: View {
    var aShare: Int
    var aName: String
    var bName: String

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Label {
                    Text("\(aName) \(aShare)%")
                } icon: {
                    Circle().fill(DS.Palette.participantA).frame(width: 8, height: 8)
                }
                Spacer()
                Label {
                    Text("\(100 - aShare)% \(bName)")
                } icon: {
                    Circle().fill(DS.Palette.participantB).frame(width: 8, height: 8)
                }
            }
            .font(.system(.footnote, design: .rounded).weight(.medium))
            .foregroundStyle(DS.Palette.textSecondary)

            GeometryReader { geo in
                HStack(spacing: 3) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(DS.Palette.participantA)
                        .frame(width: max(8, geo.size.width * CGFloat(aShare) / 100))
                    RoundedRectangle(cornerRadius: 4)
                        .fill(DS.Palette.participantB)
                }
            }
            .frame(height: 10)
        }
    }
}

// MARK: - 阶段进度

struct PhaseProgressView: View {
    var slots: [TurnSlot]
    var currentIndex: Int

    private var phases: [DebatePhase] {
        var seen: [DebatePhase] = []
        for slot in slots where !seen.contains(slot.phase) {
            seen.append(slot.phase)
        }
        return seen
    }

    private var currentPhase: DebatePhase? {
        currentIndex < slots.count ? slots[currentIndex].phase : slots.last?.phase
    }

    var body: some View {
        HStack(spacing: 8) {
            ForEach(phases, id: \.self) { phase in
                let isCurrent = phase == currentPhase
                let isPast = indexOf(phase) < indexOf(currentPhase ?? phases[0])
                HStack(spacing: 5) {
                    Circle()
                        .fill(isCurrent ? DS.Palette.brandStart : (isPast ? DS.Palette.textSecondary : DS.Palette.textTertiary))
                        .frame(width: 6, height: 6)
                    Text(phase.title)
                        .font(.system(.caption, design: .rounded).weight(isCurrent ? .bold : .regular))
                        .foregroundStyle(isCurrent ? DS.Palette.textPrimary : DS.Palette.textTertiary)
                }
                .padding(.vertical, 6)
                .padding(.horizontal, 10)
                .background(
                    Capsule().fill(isCurrent ? DS.Palette.surface : Color.clear)
                )
            }
        }
    }

    private func indexOf(_ phase: DebatePhase) -> Int {
        phases.firstIndex(of: phase) ?? 0
    }
}

// MARK: - 小标签

struct TagChip: View {
    var text: String
    var tint: Color = DS.Palette.brandStart

    var body: some View {
        Text(text)
            .font(.system(.caption, design: .rounded).weight(.medium))
            .foregroundStyle(tint)
            .padding(.vertical, 5)
            .padding(.horizontal, 10)
            .background(Capsule().fill(tint.opacity(0.14)))
    }
}

struct SectionHeader: View {
    var title: String

    var body: some View {
        Text(title)
            .font(.system(.subheadline, design: .rounded).weight(.semibold))
            .foregroundStyle(DS.Palette.textSecondary)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}
