import { useEffect, useRef, useState } from "react";
import { useTranslation } from "../i18n";

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

type BarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorLike;

interface ScannerControls {
  stop: () => void;
}

interface BarcodeScannerProps {
  onDetected: (barcode: string) => void;
  onCameraError: () => void;
}

export function BarcodeScanner({
  onDetected,
  onCameraError,
}: BarcodeScannerProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const detectedRef = useRef(onDetected);
  const errorRef = useRef(onCameraError);
  const [status, setStatus] = useState<"starting" | "scanning" | "error">(
    "starting",
  );

  detectedRef.current = onDetected;
  errorRef.current = onCameraError;

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let controls: ScannerControls | null = null;
    let timer: number | null = null;

    function stopEverything() {
      stopped = true;
      if (timer != null) window.clearInterval(timer);
      timer = null;
      controls?.stop();
      controls = null;
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
    }

    async function start() {
      const detectorCtor = (
        window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }
      ).BarcodeDetector;

      try {
        if (detectorCtor) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
            audio: false,
          });
          if (stopped) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }
          const video = videoRef.current;
          if (!video) return;
          video.srcObject = stream;
          await video.play();
          const detector = new detectorCtor();
          timer = window.setInterval(async () => {
            if (stopped || !videoRef.current) return;
            if (videoRef.current.readyState < 2) return;
            try {
              const codes = await detector.detect(videoRef.current);
              const value = codes[0]?.rawValue?.trim();
              if (value && !stopped) {
                stopped = true;
                detectedRef.current(value);
              }
            } catch {
              // Ignore a frame that cannot be decoded.
            }
          }, 300);
          setStatus("scanning");
          return;
        }

        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const video = videoRef.current;
        if (!video || stopped) return;
        const reader = new BrowserMultiFormatReader();
        controls = await reader.decodeFromConstraints(
          {
            video: { facingMode: { ideal: "environment" } },
            audio: false,
          },
          video,
          (result) => {
            if (result && !stopped) {
              stopped = true;
              detectedRef.current(result.getText());
            }
          },
        );
        if (stopped) {
          controls.stop();
          controls = null;
          return;
        }
        setStatus("scanning");
      } catch {
        if (stopped) return;
        setStatus("error");
        errorRef.current();
        stopEverything();
      }
    }

    void start();
    return stopEverything;
  }, []);

  return (
    <div className="scanner">
      <video
        ref={videoRef}
        className="scanner-video"
        playsInline
        muted
        autoPlay
      />
      <div className="scanner-frame" aria-hidden="true" />
      <p className="scanner-status">
        {status === "error"
          ? t("add.cameraError")
          : status === "starting"
            ? t("common.loading")
            : t("add.scanHint")}
      </p>
    </div>
  );
}
