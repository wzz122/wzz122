import AVFoundation
import Foundation
import Observation

struct RecordedClip: Codable, Hashable {
    var fileURL: URL
    var duration: TimeInterval
}

/// AVAudioRecorder 封装：AAC 32kbps 单声道（够 ASR 用、上传快），带电平表和硬性时长截断。
@Observable
final class AudioRecorderService: NSObject {
    private(set) var isRecording = false
    private(set) var elapsed: TimeInterval = 0
    /// 0...1 的归一化输入电平，用于 UI 呼吸动画
    private(set) var level: Double = 0

    /// 到达时长上限自动停止时回调（主线程）
    var onAutoStop: ((RecordedClip) -> Void)?

    private var recorder: AVAudioRecorder?
    private var timer: Timer?
    private var limit: TimeInterval = 90

    static func requestPermission() async -> Bool {
        await AVAudioApplication.requestRecordPermission()
    }

    func start(limit: TimeInterval) throws {
        stopTimer()
        self.limit = limit
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
        try session.setActive(true)

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("clip-\(UUID().uuidString).m4a")
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 16000.0,
            AVNumberOfChannelsKey: 1,
            AVEncoderBitRateKey: 32000,
        ]
        let recorder = try AVAudioRecorder(url: url, settings: settings)
        recorder.isMeteringEnabled = true
        recorder.record()
        self.recorder = recorder
        isRecording = true
        elapsed = 0
        level = 0

        timer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            guard let self, let recorder = self.recorder else { return }
            self.elapsed = recorder.currentTime
            recorder.updateMeters()
            let power = recorder.averagePower(forChannel: 0) // -160...0 dB
            self.level = max(0, min(1, Double(power + 50) / 50))
            if self.elapsed >= self.limit {
                if let clip = self.stop() {
                    self.onAutoStop?(clip)
                }
            }
        }
    }

    @discardableResult
    func stop() -> RecordedClip? {
        stopTimer()
        guard let recorder else { return nil }
        let duration = recorder.currentTime
        recorder.stop()
        self.recorder = nil
        isRecording = false
        deactivateSession()
        guard duration > 0.5 else {
            try? FileManager.default.removeItem(at: recorder.url)
            return nil
        }
        return RecordedClip(fileURL: recorder.url, duration: duration)
    }

    /// 放弃当前录音并删除文件
    func cancel() {
        stopTimer()
        if let recorder {
            recorder.stop()
            try? FileManager.default.removeItem(at: recorder.url)
        }
        recorder = nil
        isRecording = false
        deactivateSession()
    }

    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }

    private func deactivateSession() {
        try? AVAudioSession.sharedInstance()
            .setActive(false, options: .notifyOthersOnDeactivation)
    }
}
