package com.ssong.awallet.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.graphics.Paint
import android.graphics.Typeface
import android.os.Build
import android.text.TextPaint
import android.util.TypedValue
import android.widget.RemoteViews
import com.ssong.awallet.R
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * 금액 TextView 너비·글자 크기를 실측해 맞춤.
 * 배경 마스크는 TextView 너비와 동일. [alignParentEnd] + px 너비로 우측 정렬.
 */
object WidgetAmountLayout {
  private const val AMOUNT_TEXT_SP_MAX = 21f
  private const val AMOUNT_TEXT_SP_MIN = 12f

  data class AmountLayout(
    val widthPx: Int,
    val heightPx: Int,
    val textSizeSp: Float,
  )

  fun resolveLayout(context: Context, appWidgetId: Int, amountText: String): AmountLayout {
    val maxWidthPx = getMaxAmountWidthPx(context, appWidgetId)
    var textSizeSp = AMOUNT_TEXT_SP_MAX
    var widthPx = measureTextWidthPx(context, amountText, textSizeSp)

    while (widthPx > maxWidthPx && textSizeSp > AMOUNT_TEXT_SP_MIN) {
      textSizeSp -= 0.5f
      widthPx = measureTextWidthPx(context, amountText, textSizeSp)
    }

    return AmountLayout(
      widthPx = min(widthPx, maxWidthPx),
      heightPx = measureTextHeightPx(context, textSizeSp),
      textSizeSp = textSizeSp,
    )
  }

  fun applyToRemoteViews(
    views: RemoteViews,
    context: Context,
    appWidgetId: Int,
    amountText: String,
    isMasked: Boolean,
  ) {
    val layout = resolveLayout(context, appWidgetId, amountText)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      views.setTextViewTextSize(
        R.id.widget_amount,
        TypedValue.COMPLEX_UNIT_SP,
        layout.textSizeSp,
      )
      views.setViewLayoutWidth(
        R.id.widget_amount,
        layout.widthPx.toFloat(),
        TypedValue.COMPLEX_UNIT_PX,
      )
      views.setViewLayoutHeight(
        R.id.widget_amount,
        layout.heightPx.toFloat(),
        TypedValue.COMPLEX_UNIT_PX,
      )
    }

    if (isMasked) {
      views.setTextColor(R.id.widget_amount, context.getColor(R.color.widget_amount_text_masked))
      views.setInt(R.id.widget_amount, "setBackgroundResource", R.drawable.widget_amount_mask_background)
    } else {
      views.setTextColor(R.id.widget_amount, context.getColor(R.color.widget_amount_text))
      views.setInt(R.id.widget_amount, "setBackgroundResource", 0)
    }
  }

  private fun getMaxAmountWidthPx(context: Context, appWidgetId: Int): Int {
    val manager = AppWidgetManager.getInstance(context)
    val options = manager.getAppWidgetOptions(appWidgetId)
    val widgetMinWidthDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 110)
    val density = context.resources.displayMetrics.density
    val widgetMinWidthPx = (widgetMinWidthDp * density).toInt()
    val horizontalPaddingPx = context.resources.getDimensionPixelSize(R.dimen.widget_padding) * 2
    return max(widgetMinWidthPx - horizontalPaddingPx, (48 * density).toInt())
  }

  private fun createAmountPaint(context: Context, textSizeSp: Float): TextPaint {
    return TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
      textSize = TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_SP,
        textSizeSp,
        context.resources.displayMetrics,
      )
    }
  }

  /** px 반올림 — 마스크 좌측 여백 방지 */
  private fun measureTextWidthPx(context: Context, text: String, textSizeSp: Float): Int {
    return createAmountPaint(context, textSizeSp).measureText(text).roundToInt().coerceAtLeast(1)
  }

  /** includeFontPadding=false 와 동일하게 ascent~descent 기준 줄 높이 */
  private fun measureTextHeightPx(context: Context, textSizeSp: Float): Int {
    val metrics = createAmountPaint(context, textSizeSp).fontMetricsInt
    return (metrics.descent - metrics.ascent).coerceAtLeast(1)
  }
}
