package expo.modules.receipttext

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Reads the text in a photo with Google ML Kit, on the device (no network, no
 * account). Latin script only, which keeps the app small; receipts in Latin
 * script (English, Urdu in Roman, French, Spanish…) are read well.
 *
 * recognizeText(uri) → { text, blocks: [{ text, lines: [{ text, bounds }] }] }
 * where bounds are { x, y, width, height } in pixels of the (upright) image, so
 * the JS side can put an item's name and its price back on the same row.
 */
class ReceiptTextModule : Module() {
  private val recognizer by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }

  override fun definition() = ModuleDefinition {
    Name("ReceiptText")

    AsyncFunction("recognizeText") { uri: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("ERR_NO_CONTEXT", "The app is not ready to read images", null)
        return@AsyncFunction
      }

      // fromFilePath handles file:// and content:// URIs and applies the photo's rotation.
      val image = try {
        InputImage.fromFilePath(context, Uri.parse(uri))
      } catch (e: Exception) {
        promise.reject("ERR_READ_IMAGE", "Could not open the photo", e)
        return@AsyncFunction
      }

      recognizer
        .process(image)
        .addOnSuccessListener { result -> promise.resolve(toResult(result)) }
        .addOnFailureListener { e ->
          promise.reject("ERR_RECOGNIZE", e.message ?: "Could not read the text in the photo", e)
        }
    }
  }

  private fun toResult(result: Text): Map<String, Any?> = mapOf(
    "text" to result.text,
    "blocks" to result.textBlocks.map { block ->
      mapOf(
        "text" to block.text,
        "lines" to block.lines.map { line ->
          val box = line.boundingBox
          mapOf(
            "text" to line.text,
            "bounds" to if (box == null) null else mapOf(
              "x" to box.left,
              "y" to box.top,
              "width" to box.width(),
              "height" to box.height(),
            ),
          )
        },
      )
    },
  )
}
