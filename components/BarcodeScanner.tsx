"use client";
import { useEffect, useRef } from 'react';
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats, Html5QrcodeScannerState } from 'html5-qrcode';

interface BarcodeScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

const BarcodeScanner = ({ onScanSuccess, onClose }: BarcodeScannerProps) => {
  const hasScannedRef = useRef(false);

  useEffect(() => {
    // This function calculates the optimal size for the scanner's QR box.
    const qrboxFunction = (viewfinderWidth: number, viewfinderHeight: number) => {
      // For desktop, use a fixed size
      if (viewfinderWidth > 768) { // md breakpoint
        return { width: 250, height: 250 };
      }
      // For mobile/tablet, use a responsive size
      const minEdgePercentage = 0.7; // 70% of the smaller screen dimension
      const minEdgeSize = Math.min(viewfinderWidth, viewfinderHeight);
      const qrboxSize = Math.floor(minEdgeSize * minEdgePercentage);
      return {
        width: qrboxSize,
        height: qrboxSize,
      };
    };

    const formatsToSupport = [
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.ITF,
      Html5QrcodeSupportedFormats.QR_CODE,
    ];

    const scanner = new Html5QrcodeScanner(
      "reader",
      { 
        fps: 10, 
        qrbox: qrboxFunction,
        supportedScanTypes: [],
        formatsToSupport: formatsToSupport,
        showTorchButtonIfSupported: true,
      },
      /* verbose= */ false
    );

    const handleSuccess = (decodedText: string) => {
      if (!hasScannedRef.current) {
        hasScannedRef.current = true;
        onScanSuccess(decodedText);
      }
    };

    const handleError = (error: any) => {
      // Ignore common "not found" errors
    };

    scanner.render(handleSuccess, handleError);

    return () => {
      // The scanner is already cleared on success, 
      // but this cleanup is crucial for the "Cancel" button or closing the modal.
      if (scanner.getState() !== Html5QrcodeScannerState.NOT_STARTED) {
        scanner.clear().catch(error => {
          console.error("Failed to clear html5-qrcode-scanner on unmount.", error);
        });
      }
    };
  }, [onScanSuccess]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4">
      <div className="bg-white rounded-lg shadow-2xl p-4 sm:p-6 w-full max-w-md relative">
        <h2 className="text-xl font-bold text-neutral-800 mb-4 text-center">Scan Barcode</h2>
        <div id="reader" className="w-full"></div>
        <button 
          onClick={onClose}
          className="mt-4 w-full px-4 py-2 font-semibold text-white bg-red-600 rounded-lg shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default BarcodeScanner; 