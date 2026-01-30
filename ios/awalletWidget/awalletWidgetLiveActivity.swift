//
//  awalletWidgetLiveActivity.swift
//  awalletWidget
//
//  Created by Ssong on 1/29/26.
//

import ActivityKit
import WidgetKit
import SwiftUI

struct awalletWidgetAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        // Dynamic stateful properties about your activity go here!
        var emoji: String
    }

    // Fixed non-changing properties about your activity go here!
    var name: String
}

struct awalletWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: awalletWidgetAttributes.self) { context in
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

extension awalletWidgetAttributes {
    fileprivate static var preview: awalletWidgetAttributes {
        awalletWidgetAttributes(name: "World")
    }
}

extension awalletWidgetAttributes.ContentState {
    fileprivate static var smiley: awalletWidgetAttributes.ContentState {
        awalletWidgetAttributes.ContentState(emoji: "😀")
     }
     
     fileprivate static var starEyes: awalletWidgetAttributes.ContentState {
         awalletWidgetAttributes.ContentState(emoji: "🤩")
     }
}

#Preview("Notification", as: .content, using: awalletWidgetAttributes.preview) {
   awalletWidgetLiveActivity()
} contentStates: {
    awalletWidgetAttributes.ContentState.smiley
    awalletWidgetAttributes.ContentState.starEyes
}
