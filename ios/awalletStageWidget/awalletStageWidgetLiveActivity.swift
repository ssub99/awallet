//
//  awalletStageWidgetLiveActivity.swift
//  awalletStageWidget
//
//  Created by Ssong on 1/29/26.
//

import ActivityKit
import WidgetKit
import SwiftUI

struct awalletStageWidgetAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        // Dynamic stateful properties about your activity go here!
        var emoji: String
    }

    // Fixed non-changing properties about your activity go here!
    var name: String
}

struct awalletStageWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: awalletStageWidgetAttributes.self) { context in
            // Lock screen/banner UI goes here
            VStack {
                Text("Hello \(context.state.emoji)")
            }
            .activityBackgroundTint(Color.cyan)
            .activitySystemActionForegroundColor(Color.black)

        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded UI goes here.  Compose the expanded UI through
                // various regions, like leading/trailing/center/bottom
                DynamicIslandExpandedRegion(.leading) {
                    Text("Leading")
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("Trailing")
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text("Bottom \(context.state.emoji)")
                    // more content
                }
            } compactLeading: {
                Text("L")
            } compactTrailing: {
                Text("T \(context.state.emoji)")
            } minimal: {
                Text(context.state.emoji)
            }
            .widgetURL(URL(string: "http://www.apple.com"))
            .keylineTint(Color.red)
        }
    }
}

extension awalletStageWidgetAttributes {
    fileprivate static var preview: awalletStageWidgetAttributes {
        awalletStageWidgetAttributes(name: "World")
    }
}

extension awalletStageWidgetAttributes.ContentState {
    fileprivate static var smiley: awalletStageWidgetAttributes.ContentState {
        awalletStageWidgetAttributes.ContentState(emoji: "😀")
     }
     
     fileprivate static var starEyes: awalletStageWidgetAttributes.ContentState {
         awalletStageWidgetAttributes.ContentState(emoji: "🤩")
     }
}

#Preview("Notification", as: .content, using: awalletStageWidgetAttributes.preview) {
   awalletStageWidgetLiveActivity()
} contentStates: {
    awalletStageWidgetAttributes.ContentState.smiley
    awalletStageWidgetAttributes.ContentState.starEyes
}
