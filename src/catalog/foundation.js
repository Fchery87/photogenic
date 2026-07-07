function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createCatalogFoundation() {
  return {
    summarizeDashboardWorkspace({
      snapshot,
      visibleImages = [],
      keeperImages = [],
      rejectedImages = [],
      selectedImage = null,
      activePreset = null,
      activeBatchSession = null,
    } = {}) {
      if (!snapshot || typeof snapshot !== "object") {
        throw new TypeError("snapshot is required");
      }

      const visibleWithKnownByteSize = visibleImages.filter((image) => Number.isInteger(image?.byteSize));
      const visibleWithKnownModifiedAt = visibleImages.filter((image) => typeof image?.modifiedAt === "string");
      const visibleWithKnownDimensions = visibleImages.filter((image) => Number.isInteger(image?.pixelWidth) && Number.isInteger(image?.pixelHeight));
      const visibleWithObservedOrientation = visibleImages.filter((image) => Number.isInteger(image?.orientation));
      const visibleWithObservedCaptureAt = visibleImages.filter((image) => typeof image?.observedCaptureAt === "string");
      const visibleWithObservedCamera = visibleImages.filter((image) => typeof image?.cameraMake === "string" || typeof image?.cameraModel === "string");
      const visibleWithObservedLens = visibleImages.filter((image) => typeof image?.lensModel === "string");
      const visibleWithObservedFocalLength = visibleImages.filter((image) => typeof image?.focalLengthMm === "number" && Number.isFinite(image.focalLengthMm) && image.focalLengthMm > 0);
      const visibleWithObservedFNumber = visibleImages.filter((image) => typeof image?.fNumber === "number" && Number.isFinite(image.fNumber) && image.fNumber > 0);
      const visibleWithObservedIsoSpeed = visibleImages.filter((image) => Number.isInteger(image?.isoSpeed) && image.isoSpeed > 0);
      const visibleWithObservedExposureTime = visibleImages.filter((image) => typeof image?.exposureTimeSeconds === "number" && Number.isFinite(image.exposureTimeSeconds) && image.exposureTimeSeconds > 0);
      const visibleWithObservedExposureProgram = visibleImages.filter((image) => Number.isInteger(image?.exposureProgram));
      const visibleWithObservedFlash = visibleImages.filter((image) => typeof image?.flashFired === "boolean");
      const visibleWithObservedExposureBias = visibleImages.filter((image) => typeof image?.exposureBiasEv === "number" && Number.isFinite(image.exposureBiasEv));
      const visibleWithObservedMeteringMode = visibleImages.filter((image) => Number.isInteger(image?.meteringMode));
      const visibleWithObservedWhiteBalanceMode = visibleImages.filter((image) => Number.isInteger(image?.whiteBalanceMode));
      const visibleWithObservedExposureMode = visibleImages.filter((image) => Number.isInteger(image?.exposureMode));
      const visibleWithObservedGps = visibleImages.filter((image) => typeof image?.gpsLatitude === "number" && Number.isFinite(image.gpsLatitude) && typeof image?.gpsLongitude === "number" && Number.isFinite(image.gpsLongitude));
      const visibleWithObservedGpsAltitude = visibleImages.filter((image) => typeof image?.gpsAltitudeM === "number" && Number.isFinite(image.gpsAltitudeM));
      const visibleByteSizeTotal = visibleWithKnownByteSize.reduce((sum, image) => sum + image.byteSize, 0);
      const latestVisibleModifiedAt = visibleWithKnownModifiedAt
        .map((image) => image.modifiedAt)
        .sort((a, b) => String(b).localeCompare(String(a)))[0] ?? null;
      const latestVisibleSourceFile = [...visibleWithKnownModifiedAt]
        .sort((a, b) => String(b.modifiedAt).localeCompare(String(a.modifiedAt)))[0] ?? null;
      const largestVisibleSourceFile = [...visibleWithKnownByteSize]
        .sort((a, b) => {
          const bySize = b.byteSize - a.byteSize;
          if (bySize !== 0) return bySize;
          return String(b.modifiedAt ?? "").localeCompare(String(a.modifiedAt ?? ""));
        })[0] ?? null;
      const latestVisibleObservedCaptureSourceFile = [...visibleWithObservedCaptureAt]
        .sort((a, b) => String(b.observedCaptureAt).localeCompare(String(a.observedCaptureAt)))[0] ?? null;
      const observedFormatCounts = visibleImages.reduce((summary, image) => {
        const observedFormat = typeof image?.observedFormat === "string" ? image.observedFormat : null;
        if (!observedFormat) return summary;
        summary[observedFormat] = (summary[observedFormat] ?? 0) + 1;
        return summary;
      }, {});
      const latestVisibleObservedFormatSourceFile = [...visibleImages]
        .filter((image) => typeof image?.observedFormat === "string")
        .sort((a, b) => String(b.modifiedAt ?? "").localeCompare(String(a.modifiedAt ?? "")))[0] ?? null;
      const observedCameraCounts = visibleImages.reduce((summary, image) => {
        const cameraMake = typeof image?.cameraMake === "string" ? image.cameraMake : null;
        const cameraModel = typeof image?.cameraModel === "string" ? image.cameraModel : null;
        const label = [cameraMake, cameraModel].filter(Boolean).join(" ") || cameraModel || cameraMake;
        if (!label) return summary;
        summary[label] = (summary[label] ?? 0) + 1;
        return summary;
      }, {});
      const latestVisibleObservedCameraSourceFile = [...visibleWithObservedCamera]
        .sort((a, b) => String(b.modifiedAt ?? "").localeCompare(String(a.modifiedAt ?? "")))[0] ?? null;
      const observedLensCounts = visibleImages.reduce((summary, image) => {
        const lensModel = typeof image?.lensModel === "string" ? image.lensModel : null;
        if (!lensModel) return summary;
        summary[lensModel] = (summary[lensModel] ?? 0) + 1;
        return summary;
      }, {});
      const latestVisibleObservedLensSourceFile = [...visibleWithObservedLens]
        .sort((a, b) => String(b.modifiedAt ?? "").localeCompare(String(a.modifiedAt ?? "")))[0] ?? null;
      const latestVisibleObservedFocalLengthSourceFile = [...visibleWithObservedFocalLength]
        .sort((a, b) => String(b.modifiedAt ?? "").localeCompare(String(a.modifiedAt ?? "")))[0] ?? null;
      const latestVisibleObservedGpsSourceFile = [...visibleWithObservedGps]
        .sort((a, b) => String(b.modifiedAt ?? "").localeCompare(String(a.modifiedAt ?? "")))[0] ?? null;
      const latestVisibleObservedGpsAltitudeSourceFile = [...visibleWithObservedGpsAltitude]
        .sort((a, b) => String(b.modifiedAt ?? "").localeCompare(String(a.modifiedAt ?? "")))[0] ?? null;
      const latestVisibleObservedExposureSourceFile = [...visibleImages]
        .filter((image) => (typeof image?.fNumber === "number" && Number.isFinite(image.fNumber) && image.fNumber > 0) || (Number.isInteger(image?.isoSpeed) && image.isoSpeed > 0) || (typeof image?.exposureTimeSeconds === "number" && Number.isFinite(image.exposureTimeSeconds) && image.exposureTimeSeconds > 0) || typeof image?.flashFired === "boolean" || (typeof image?.exposureBiasEv === "number" && Number.isFinite(image.exposureBiasEv)))
        .sort((a, b) => String(b.modifiedAt ?? "").localeCompare(String(a.modifiedAt ?? "")))[0] ?? null;

      return {
        snapshot: clone(snapshot),
        counts: {
          visible: visibleImages.length,
          keepers: keeperImages.length,
          rejected: rejectedImages.length,
        },
        visibleSourceFiles: {
          byteSizeTotal: visibleByteSizeTotal,
          withKnownByteSize: visibleWithKnownByteSize.length,
          withMissingByteSize: visibleImages.length - visibleWithKnownByteSize.length,
          withKnownModifiedAt: visibleWithKnownModifiedAt.length,
          withMissingModifiedAt: visibleImages.length - visibleWithKnownModifiedAt.length,
          withKnownDimensions: visibleWithKnownDimensions.length,
          withMissingDimensions: visibleImages.length - visibleWithKnownDimensions.length,
          withObservedOrientation: visibleWithObservedOrientation.length,
          withObservedCaptureAt: visibleWithObservedCaptureAt.length,
          withObservedCamera: visibleWithObservedCamera.length,
          withObservedLens: visibleWithObservedLens.length,
          withObservedFocalLength: visibleWithObservedFocalLength.length,
          withObservedFNumber: visibleWithObservedFNumber.length,
          withObservedIsoSpeed: visibleWithObservedIsoSpeed.length,
          withObservedExposureTime: visibleWithObservedExposureTime.length,
          withObservedExposureProgram: visibleWithObservedExposureProgram.length,
          withObservedFlash: visibleWithObservedFlash.length,
          withObservedExposureBias: visibleWithObservedExposureBias.length,
          withObservedMeteringMode: visibleWithObservedMeteringMode.length,
          withObservedWhiteBalanceMode: visibleWithObservedWhiteBalanceMode.length,
          withObservedExposureMode: visibleWithObservedExposureMode.length,
          withObservedGps: visibleWithObservedGps.length,
          withObservedGpsAltitude: visibleWithObservedGpsAltitude.length,
          withIncompleteMetadata: visibleImages.filter((image) => !Number.isInteger(image?.byteSize) || typeof image?.modifiedAt !== "string" || !Number.isInteger(image?.pixelWidth) || !Number.isInteger(image?.pixelHeight)).length,
          latestModifiedAt: latestVisibleModifiedAt,
          latestObservedCaptureAt: [...visibleWithObservedCaptureAt]
            .map((image) => image.observedCaptureAt)
            .sort((a, b) => String(b).localeCompare(String(a)))[0] ?? null,
          observedFormats: observedFormatCounts,
          observedCameras: observedCameraCounts,
          observedLenses: observedLensCounts,
          focalLengthMmRange: visibleWithObservedFocalLength.length
            ? {
              min: [...visibleWithObservedFocalLength].map((image) => image.focalLengthMm).sort((a, b) => a - b)[0],
              max: [...visibleWithObservedFocalLength].map((image) => image.focalLengthMm).sort((a, b) => b - a)[0],
            }
            : null,
          fNumberRange: visibleWithObservedFNumber.length
            ? {
              min: [...visibleWithObservedFNumber].map((image) => image.fNumber).sort((a, b) => a - b)[0],
              max: [...visibleWithObservedFNumber].map((image) => image.fNumber).sort((a, b) => b - a)[0],
            }
            : null,
          isoSpeedRange: visibleWithObservedIsoSpeed.length
            ? {
              min: [...visibleWithObservedIsoSpeed].map((image) => image.isoSpeed).sort((a, b) => a - b)[0],
              max: [...visibleWithObservedIsoSpeed].map((image) => image.isoSpeed).sort((a, b) => b - a)[0],
            }
            : null,
          exposureTimeSecondsRange: visibleWithObservedExposureTime.length
            ? {
              min: [...visibleWithObservedExposureTime].map((image) => image.exposureTimeSeconds).sort((a, b) => a - b)[0],
              max: [...visibleWithObservedExposureTime].map((image) => image.exposureTimeSeconds).sort((a, b) => b - a)[0],
            }
            : null,
          flashUsage: {
            fired: visibleImages.filter((image) => image?.flashFired === true).length,
            notFired: visibleImages.filter((image) => image?.flashFired === false).length,
          },
          exposureBiasEvRange: visibleWithObservedExposureBias.length
            ? {
              min: [...visibleWithObservedExposureBias].map((image) => image.exposureBiasEv).sort((a, b) => a - b)[0],
              max: [...visibleWithObservedExposureBias].map((image) => image.exposureBiasEv).sort((a, b) => b - a)[0],
            }
            : null,
          gpsAltitudeRange: visibleWithObservedGpsAltitude.length
            ? {
              min: [...visibleWithObservedGpsAltitude].map((image) => image.gpsAltitudeM).sort((a, b) => a - b)[0],
              max: [...visibleWithObservedGpsAltitude].map((image) => image.gpsAltitudeM).sort((a, b) => b - a)[0],
            }
            : null,
          meteringModes: visibleImages.reduce((summary, image) => {
            if (!Number.isInteger(image?.meteringMode)) return summary;
            summary[image.meteringMode] = (summary[image.meteringMode] ?? 0) + 1;
            return summary;
          }, {}),
          whiteBalanceModes: visibleImages.reduce((summary, image) => {
            if (!Number.isInteger(image?.whiteBalanceMode)) return summary;
            summary[image.whiteBalanceMode] = (summary[image.whiteBalanceMode] ?? 0) + 1;
            return summary;
          }, {}),
          exposurePrograms: visibleImages.reduce((summary, image) => {
            if (!Number.isInteger(image?.exposureProgram)) return summary;
            summary[image.exposureProgram] = (summary[image.exposureProgram] ?? 0) + 1;
            return summary;
          }, {}),
          exposureModes: visibleImages.reduce((summary, image) => {
            if (!Number.isInteger(image?.exposureMode)) return summary;
            summary[image.exposureMode] = (summary[image.exposureMode] ?? 0) + 1;
            return summary;
          }, {}),
          largestPixelArea: visibleWithKnownDimensions
            .map((image) => image.pixelWidth * image.pixelHeight)
            .sort((a, b) => b - a)[0] ?? null,
        },
        latestVisibleSourceFile: latestVisibleSourceFile ? clone(latestVisibleSourceFile) : null,
        latestVisibleObservedCaptureSourceFile: latestVisibleObservedCaptureSourceFile ? clone(latestVisibleObservedCaptureSourceFile) : null,
        latestVisibleObservedFormatSourceFile: latestVisibleObservedFormatSourceFile ? clone(latestVisibleObservedFormatSourceFile) : null,
        latestVisibleObservedCameraSourceFile: latestVisibleObservedCameraSourceFile ? clone(latestVisibleObservedCameraSourceFile) : null,
        latestVisibleObservedLensSourceFile: latestVisibleObservedLensSourceFile ? clone(latestVisibleObservedLensSourceFile) : null,
        latestVisibleObservedFocalLengthSourceFile: latestVisibleObservedFocalLengthSourceFile ? clone(latestVisibleObservedFocalLengthSourceFile) : null,
        latestVisibleObservedGpsSourceFile: latestVisibleObservedGpsSourceFile ? clone(latestVisibleObservedGpsSourceFile) : null,
        latestVisibleObservedGpsAltitudeSourceFile: latestVisibleObservedGpsAltitudeSourceFile ? clone(latestVisibleObservedGpsAltitudeSourceFile) : null,
        latestVisibleObservedExposureSourceFile: latestVisibleObservedExposureSourceFile ? clone(latestVisibleObservedExposureSourceFile) : null,
        latestVisibleSourceFileMissingMetadata: (() => {
          const latestMissing = [...visibleImages]
            .filter((image) => !Number.isInteger(image?.byteSize) || typeof image?.modifiedAt !== "string" || !Number.isInteger(image?.pixelWidth) || !Number.isInteger(image?.pixelHeight))
            .sort((a, b) => String(b.modifiedAt ?? "").localeCompare(String(a.modifiedAt ?? "")))[0] ?? null;
          return latestMissing ? clone(latestMissing) : null;
        })(),
        largestVisibleSourceFile: largestVisibleSourceFile ? clone(largestVisibleSourceFile) : null,
        selectedImage: selectedImage ? clone(selectedImage) : null,
        selectedImageSourceFile: selectedImage
          ? {
            sourcePath: selectedImage.sourcePath,
            fileName: selectedImage.fileName ?? null,
            byteSize: Number.isInteger(selectedImage.byteSize) ? selectedImage.byteSize : null,
            modifiedAt: typeof selectedImage.modifiedAt === "string" ? selectedImage.modifiedAt : null,
            observedFormat: typeof selectedImage.observedFormat === "string" ? selectedImage.observedFormat : null,
            pixelWidth: Number.isInteger(selectedImage.pixelWidth) ? selectedImage.pixelWidth : null,
            pixelHeight: Number.isInteger(selectedImage.pixelHeight) ? selectedImage.pixelHeight : null,
            orientation: Number.isInteger(selectedImage.orientation) ? selectedImage.orientation : null,
            observedCaptureAt: typeof selectedImage.observedCaptureAt === "string" ? selectedImage.observedCaptureAt : null,
            cameraMake: typeof selectedImage.cameraMake === "string" ? selectedImage.cameraMake : null,
            cameraModel: typeof selectedImage.cameraModel === "string" ? selectedImage.cameraModel : null,
            lensModel: typeof selectedImage.lensModel === "string" ? selectedImage.lensModel : null,
            focalLengthMm: typeof selectedImage.focalLengthMm === "number" && Number.isFinite(selectedImage.focalLengthMm) && selectedImage.focalLengthMm > 0 ? selectedImage.focalLengthMm : null,
            fNumber: typeof selectedImage.fNumber === "number" && Number.isFinite(selectedImage.fNumber) && selectedImage.fNumber > 0 ? selectedImage.fNumber : null,
            isoSpeed: Number.isInteger(selectedImage.isoSpeed) && selectedImage.isoSpeed > 0 ? selectedImage.isoSpeed : null,
            exposureTimeSeconds: typeof selectedImage.exposureTimeSeconds === "number" && Number.isFinite(selectedImage.exposureTimeSeconds) && selectedImage.exposureTimeSeconds > 0 ? selectedImage.exposureTimeSeconds : null,
            exposureProgram: Number.isInteger(selectedImage.exposureProgram) ? selectedImage.exposureProgram : null,
            exposureMode: Number.isInteger(selectedImage.exposureMode) ? selectedImage.exposureMode : null,
            flashFired: typeof selectedImage.flashFired === "boolean" ? selectedImage.flashFired : null,
            exposureBiasEv: typeof selectedImage.exposureBiasEv === "number" && Number.isFinite(selectedImage.exposureBiasEv) ? selectedImage.exposureBiasEv : null,
            meteringMode: Number.isInteger(selectedImage.meteringMode) ? selectedImage.meteringMode : null,
            whiteBalanceMode: Number.isInteger(selectedImage.whiteBalanceMode) ? selectedImage.whiteBalanceMode : null,
            gpsLatitude: typeof selectedImage.gpsLatitude === "number" && Number.isFinite(selectedImage.gpsLatitude) ? selectedImage.gpsLatitude : null,
            gpsLongitude: typeof selectedImage.gpsLongitude === "number" && Number.isFinite(selectedImage.gpsLongitude) ? selectedImage.gpsLongitude : null,
            gpsAltitudeM: typeof selectedImage.gpsAltitudeM === "number" && Number.isFinite(selectedImage.gpsAltitudeM) ? selectedImage.gpsAltitudeM : null,
          }
          : null,
        activePreset: activePreset ? clone(activePreset) : null,
        activeBatchSession: activeBatchSession ? clone(activeBatchSession) : null,
        expandedImageIds: Array.isArray(snapshot.expandedImageIds) ? [...snapshot.expandedImageIds] : [],
      };
    },
  };
}
