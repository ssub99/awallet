/**
 * Category Create Screen
 * 
 * Screen for creating a new expense or income category.
 * Allows users to select an emoji and enter a category name.
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ModalBottomsheet } from '@/components/ui/modal-bottomsheet';
import { type CategoryType } from '@/constants/categories';
import { colors, typography } from '@/constants/theme';
import { typographyLayout } from '@/constants/typography';
import { useToast } from '@/contexts/toast-context';
import { useAndroidKeyboardBottomCtaHide } from '@/hooks/use-android-keyboard-bottom-cta-hide';
import { loadCategories, saveCategories } from '@/utils/categories';
import type { FlashListRef } from '@shopify/flash-list';
import { FlashList } from '@shopify/flash-list';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

// 이모지 카테고리 타입
type EmojiCategory = 'recent' | 'people' | 'animals' | 'food' | 'activity' | 'travel' | 'objects' | 'symbols' | 'flags';

// 이모지 카테고리별 목록
const EMOJI_CATEGORIES: Record<EmojiCategory, string[]> = {
  recent: [], // 사용자가 선택한 이모지만 저장
  people: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '👤', '👥', '👶', '🧒', '👦', '👧', '🧑', '👱', '👨', '🧔', '👨‍🦰', '👨‍🦱', '👨‍🦳', '👨‍🦲', '👩', '👩‍🦰', '👩‍🦱', '👩‍🦳', '👩‍🦲', '🧓', '👴', '👵', '🙍', '🙍‍♂️', '🙍‍♀️', '🙎', '🙎‍♂️', '🙎‍♀️', '🙅', '🙅‍♂️', '🙅‍♀️', '🙆', '🙆‍♂️', '🙆‍♀️', '💁', '💁‍♂️', '💁‍♀️', '🙋', '🙋‍♂️', '🙋‍♀️', '🧏', '🧏‍♂️', '🧏‍♀️', '🤦', '🤦‍♂️', '🤦‍♀️', '🤷', '🤷‍♂️', '🤷‍♀️', '🙇', '🙇‍♂️', '🙇‍♀️', '🤦', '🤦‍♂️', '🤦‍♀️', '🤷', '🤷‍♂️', '🤷‍♀️', '🧑‍⚕️', '👨‍⚕️', '👩‍⚕️', '🧑‍🎓', '👨‍🎓', '👩‍🎓', '🧑‍🏫', '👨‍🏫', '👩‍🏫', '🧑‍⚖️', '👨‍⚖️', '👩‍⚖️', '🧑‍🌾', '👨‍🌾', '👩‍🌾', '🧑‍🍳', '👨‍🍳', '👩‍🍳', '🧑‍🔧', '👨‍🔧', '👩‍🔧', '🧑‍🏭', '👨‍🏭', '👩‍🏭', '🧑‍💼', '👨‍💼', '👩‍💼', '🧑‍🔬', '👨‍🔬', '👩‍🔬', '🧑‍💻', '👨‍💻', '👩‍💻', '🧑‍🎤', '👨‍🎤', '👩‍🎤', '🧑‍🎨', '👨‍🎨', '👩‍🎨', '🧑‍✈️', '👨‍✈️', '👩‍✈️', '🧑‍🚀', '👨‍🚀', '👩‍🚀', '🧑‍🚒', '👨‍🚒', '👩‍🚒', '👮', '👮‍♂️', '👮‍♀️', '🕵️', '🕵️‍♂️', '🕵️‍♀️', '💂', '💂‍♂️', '💂‍♀️', '🥷', '👷', '👷‍♂️', '👷‍♀️', '🤴', '👸', '👳', '👳‍♂️', '👳‍♀️', '👲', '🧕', '🤵', '👰', '🤰', '🤱', '👼', '🎅', '🤶', '🦸', '🦸‍♂️', '🦸‍♀️', '🦹', '🦹‍♂️', '🦹‍♀️', '🧙', '🧙‍♂️', '🧙‍♀️', '🧚', '🧚‍♂️', '🧚‍♀️', '🧛', '🧛‍♂️', '🧛‍♀️', '🧜', '🧜‍♂️', '🧜‍♀️', '🧝', '🧝‍♂️', '🧝‍♀️', '🧞', '🧞‍♂️', '🧞‍♀️', '🧟', '🧟‍♂️', '🧟‍♀️', '🧌', '💆', '💆‍♂️', '💆‍♀️', '💇', '💇‍♂️', '💇‍♀️', '🚶', '🚶‍♂️', '🚶‍♀️', '🧍', '🧍‍♂️', '🧍‍♀️', '🧎', '🧎‍♂️', '🧎‍♀️', '🏃', '🏃‍♂️', '🏃‍♀️', '💃', '🕺', '🕴️', '👯', '👯‍♂️', '👯‍♀️', '🧘', '🧘‍♂️', '🧘‍♀️', '🧗', '🧗‍♂️', '🧗‍♀️', '🤺', '🏇', '⛷️', '🏂', '🏌️', '🏌️‍♂️', '🏌️‍♀️', '🏄', '🏄‍♂️', '🏄‍♀️', '🚣', '🚣‍♂️', '🚣‍♀️', '🏊', '🏊‍♂️', '🏊‍♀️', '⛹️', '⛹️‍♂️', '⛹️‍♀️', '🏋️', '🏋️‍♂️', '🏋️‍♀️', '🚴', '🚴‍♂️', '🚴‍♀️', '🚵', '🚵‍♂️', '🚵‍♀️', '🤸', '🤸‍♂️', '🤸‍♀️', '🤼', '🤼‍♂️', '🤼‍♀️', '🤽', '🤽‍♂️', '🤽‍♀️', '🤾', '🤾‍♂️', '🤾‍♀️', '🤹', '🤹‍♂️', '🤹‍♀️', '🧘', '🧘‍♂️', '🧘‍♀️', '🛀', '🛌', '👭', '👫', '👬', '💏', '💑', '👪', '👨‍👩‍👧', '👨‍👩‍👧‍👦', '👨‍👩‍👦‍👦', '👨‍👩‍👧‍👧', '👩‍👩‍👦', '👩‍👩‍👧', '👩‍👩‍👧‍👦', '👩‍👩‍👦‍👦', '👩‍👩‍👧‍👧', '👨‍👨‍👦', '👨‍👨‍👧', '👨‍👨‍👧‍👦', '👨‍👨‍👦‍👦', '👨‍👨‍👧‍👧', '👩‍👦', '👩‍👧', '👩‍👧‍👦', '👩‍👦‍👦', '👩‍👧‍👧', '👨‍👦', '👨‍👧', '👨‍👧‍👦', '👨‍👦‍👦', '👨‍👧‍👧', '👪', '👨‍👩‍👧', '👨‍👩‍👧‍👦', '👨‍👩‍👦‍👦', '👨‍👩‍👧‍👧', '👩‍👩‍👦', '👩‍👩‍👧', '👩‍👩‍👧‍👦', '👩‍👩‍👦‍👦', '👩‍👩‍👧‍👧', '👨‍👨‍👦', '👨‍👨‍👧', '👨‍👨‍👧‍👦', '👨‍👨‍👦‍👦', '👨‍👨‍👧‍👧'],
  animals: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐽', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒', '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🦗', '🕷', '🦂', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🦬', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩', '🦮', '🐕‍🦺', '🐈', '🐈‍⬛', '🪶', '🦅', '🦆', '🦢', '🦩', '🦚', '🦜', '🐓', '🦃', '🦤', '🦉', '🦅', '🦆', '🦢', '🦩', '🦚', '🦜'],
  food: ['🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶', '🌽', '🥕', '🥔', '🍠', '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🥞', '🥓', '🥩', '🍗', '🍖', '🦴', '🌭', '🍔', '🍟', '🍕', '🥪', '🥙', '🌮', '🌯', '🥗', '🥘', '🥫', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🦪', '🍤', '🍙', '🍚', '🍘', '🍥', '🥠', '🥮', '🍢', '🍡', '🍧', '🍨', '🍦', '🥧', '🧁', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫', '🍿', '🍩', '🍪', '🌰', '🥜', '🍯', '🥛', '🍼', '🫖', '☕️', '🍵', '🧃', '🥤', '🧋', '🍶', '🍺', '🍻', '🥂', '🍷', '🥃', '🍸', '🍹', '🧉', '🍾', '🧊'],
  activity: ['⚽️', '🏀', '🏈', '⚾️', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🏓', '🏸', '🥅', '🏒', '🏑', '🥍', '🏏', '🥊', '🥋', '🎽', '🛹', '🛷', '⛸', '🥌', '🎿', '⛷', '🏂', '🪂', '🏋️', '🤼', '🤸', '🤺', '⛹️', '🤾', '🏌️', '🏇', '🧘', '🏄', '🏊', '🤽', '🚣', '🧗', '🚵', '🚴', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖', '🏵', '🎗', '🎫', '🎟', '🎪', '🤹', '🎭', '🩰', '🎨', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🎷', '🎺', '🎸', '🪕', '🎻', '🎲', '♟', '🎯', '🎳', '🎮', '🎰', '🧩'],
  travel: ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🛴', '🚲', '🛵', '🏍', '🛺', '🚨', '🚔', '🚍', '🚘', '🚖', '🚡', '🚠', '🚟', '🚃', '🚋', '🚞', '🚝', '🚄', '🚅', '🚈', '🚂', '🚆', '🚇', '🚊', '🚉', '✈️', '🛫', '🛬', '🛩', '💺', '🚁', '🚟', '🚠', '🚡', '🛰', '🚀', '🛸', '🛎', '🧳', '⌛️', '⏳', '⌚️', '⏰', '⏱', '⏲', '🕰', '🕛', '🕧', '🕐', '🕜', '🕑', '🕝', '🕒', '🕞', '🕓', '🕟', '🕔', '🕠', '🕕', '🕡', '🕖', '🕢', '🕗', '🕣', '🕘', '🕤', '🕙', '🕥', '🕚', '🕦', '🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘', '🌙', '🌚', '🌛', '🌜', '🌡', '☀️', '🌝', '🌞', '⭐', '🌟', '🌠', '☁️', '⛅', '⛈', '🌤', '🌥', '🌦', '🌧', '🌨', '🌩', '🌪', '🌫', '🌬', '🌀', '🌈', '🌂', '☂️', '☔', '⛱', '⚡', '❄️', '☃️', '⛄', '☄️', '🔥', '💧', '🌊'],
  objects: ['⌚️', '📱', '📲', '💻', '⌨️', '🖥', '🖨', '🖱', '🖲', '🕹', '🗜', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥', '📽', '🎞', '📞', '☎️', '📟', '📠', '📺', '📻', '🎙', '🎚', '🎛', '⏱', '⏲', '⏰', '🕰', '⌛️', '⏳', '📡', '🔋', '🔌', '💡', '🔦', '🕯', '🧯', '🛢', '💸', '💵', '💴', '💶', '💷', '💰', '💳', '💎', '⚖️', '🛠', '🔧', '🔨', '⚒', '🛠', '⛏', '🔩', '⚙️', '🧰', '🧲', '🔫', '💣', '🧨', '🔪', '🗡', '⚔️', '🛡', '🚬', '⚰️', '⚱️', '🏺', '🔮', '📿', '🧿', '💈', '⚗️', '🔭', '🔬', '🕳', '💊', '💉', '🧬', '🦠', '🧫', '🧪', '🌡', '🧹', '🧺', '🧻', '🚽', '🚿', '🛁', '🛀', '🧼', '🧽', '🧴', '🛎', '🔑', '🗝', '🚪', '🪑', '🛋', '🛏', '🛌', '🧸', '🖼', '🛍', '🛒', '🎁', '🎈', '🎏', '🎀', '🪄', '🪅', '🪆', '🎊', '🎉', '🎎', '🏮', '🎐', '🧧', '✉️', '📩', '📨', '📧', '💌', '📥', '📤', '📦', '🏷', '📪', '📫', '📬', '📭', '📮', '📯', '📜', '📃', '📄', '📑', '🧾', '📊', '📈', '📉', '🗒', '🗓', '📆', '📅', '🗑', '📇', '🗃', '🗳', '🗄', '📋', '📁', '📂', '🗂', '🗞', '📰', '📓', '📔', '📒', '📕', '📗', '📘', '📙', '📚', '📖', '🔖', '🧷', '🔗', '📎', '🖇', '📐', '📏', '🧮', '📌', '📍', '✂️', '🖊', '🖋', '✒️', '🖌', '🖍', '📝', '✏️', '🔍', '🔎', '🔏', '🔐', '🔒', '🔓'],
  symbols: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈️', '♉️', '♊️', '♋️', '♌️', '♍️', '♎️', '♏️', '♐️', '♑️', '♒️', '♓️', '🆔', '⚛️', '🉑', '☢️', '☣️', '📴', '📳', '🈶', '🈚️', '🈸', '🈺', '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️', '㊗️', '🈴', '🈵', '🈹', '🈲', '🅰️', '🅱️', '🆎', '🆑', '🅾️', '🆘', '❌', '⭕️', '🛑', '⛔️', '📛', '🚫', '💯', '💢', '♨️', '🚷', '🚯', '🚳', '🚱', '🔞', '📵', '🚭', '❗️', '❓', '❕', '❔', '‼️', '⁉️', '🔅', '🔆', '〽️', '⚠️', '🚸', '🔱', '⚜️', '🔰', '♻️', '✅', '🈯️', '💹', '❇️', '✳️', '❎', '🌐', '💠', 'Ⓜ️', '🌀', '💤', '🏧', '🚾', '♿️', '🅿️', '🈳', '🈂️', '🛂', '🛃', '🛄', '🛅', '🚹', '🚺', '🚼', '🚻', '🚮', '🎦', '📶', '🈁', '🔣', 'ℹ️', '🔤', '🔡', '🔠', '🆖', '🆗', '🆙', '🆒', '🆕', '🆓', '0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '🔢', '▶️', '⏸', '⏯', '⏹', '⏺', '⏭', '⏮', '⏩', '⏪', '⏫', '⏬', '◀️', '🔼', '🔽', '➡️', '⬅️', '⬆️', '⬇️', '↗️', '↘️', '↙️', '↖️', '↕️', '↔️', '↪️', '↩️', '⤴️', '⤵️', '🔀', '🔁', '🔂', '🔄', '🔃', '🎵', '🎶', '➕', '➖', '➗', '✖️', '💲', '💱', '™️', '©️', '®️', '〰️', '➰', '➿', '🔚', '🔙', '🔛', '🔜', '🔝', '✔️', '☑️', '🔘', '⚪️', '⚫️', '🔴', '🔵', '🟠', '🟡', '🟢', '🟣', '🟤', '⚫️', '🔶', '🔷', '🔸', '🔹', '🔺', '🔻', '💠', '🔘', '🔳', '🔲', '▪️', '▫️', '◾️', '◽️', '◼️', '◻️', '🟥', '🟧', '🟨', '🟩', '🟦', '🟪', '🟫', '⬛️', '⬜️', '🟨', '🟩', '🟦', '🟪', '🟫'],
  flags: ['🏳️', '🏴', '🏁', '🚩', '🏳️‍🌈', '🏳️‍⚧️', '🇦🇨', '🇦🇩', '🇦🇪', '🇦🇫', '🇦🇬', '🇦🇮', '🇦🇱', '🇦🇲', '🇦🇴', '🇦🇶', '🇦🇷', '🇦🇸', '🇦🇹', '🇦🇺', '🇦🇼', '🇦🇽', '🇦🇿', '🇧🇦', '🇧🇧', '🇧🇩', '🇧🇪', '🇧🇫', '🇧🇬', '🇧🇭', '🇧🇮', '🇧🇯', '🇧🇱', '🇧🇲', '🇧🇳', '🇧🇴', '🇧🇶', '🇧🇷', '🇧🇸', '🇧🇹', '🇧🇻', '🇧🇼', '🇧🇾', '🇧🇿', '🇨🇦', '🇨🇨', '🇨🇩', '🇨🇫', '🇨🇬', '🇨🇭', '🇨🇮', '🇨🇰', '🇨🇱', '🇨🇲', '🇨🇳', '🇨🇴', '🇨🇵', '🇨🇷', '🇨🇺', '🇨🇻', '🇨🇼', '🇨🇽', '🇨🇾', '🇨🇿', '🇩🇪', '🇩🇬', '🇩🇯', '🇩🇰', '🇩🇲', '🇩🇴', '🇩🇿', '🇪🇦', '🇪🇨', '🇪🇪', '🇪🇬', '🇪🇭', '🇪🇷', '🇪🇸', '🇪🇹', '🇪🇺', '🇫🇮', '🇫🇯', '🇫🇰', '🇫🇲', '🇫🇴', '🇫🇷', '🇬🇦', '🇬🇧', '🇬🇩', '🇬🇪', '🇬🇫', '🇬🇬', '🇬🇭', '🇬🇮', '🇬🇱', '🇬🇲', '🇬🇳', '🇬🇵', '🇬🇶', '🇬🇷', '🇬🇸', '🇬🇹', '🇬🇺', '🇬🇼', '🇬🇾', '🇭🇰', '🇭🇲', '🇭🇳', '🇭🇷', '🇭🇹', '🇭🇺', '🇮🇩', '🇮🇪', '🇮🇱', '🇮🇲', '🇮🇳', '🇮🇴', '🇮🇶', '🇮🇷', '🇮🇸', '🇮🇹', '🇯🇪', '🇯🇲', '🇯🇴', '🇯🇵', '🇰🇪', '🇰🇬', '🇰🇭', '🇰🇮', '🇰🇲', '🇰🇳', '🇰🇵', '🇰🇷', '🇰🇼', '🇰🇾', '🇰🇿', '🇱🇦', '🇱🇧', '🇱🇨', '🇱🇮', '🇱🇰', '🇱🇷', '🇱🇸', '🇱🇹', '🇱🇺', '🇱🇻', '🇱🇾', '🇲🇦', '🇲🇨', '🇲🇩', '🇲🇪', '🇲🇫', '🇲🇬', '🇲🇭', '🇲🇰', '🇲🇱', '🇲🇲', '🇲🇳', '🇲🇴', '🇲🇵', '🇲🇶', '🇲🇷', '🇲🇸', '🇲🇹', '🇲🇺', '🇲🇻', '🇲🇼', '🇲🇽', '🇲🇾', '🇲🇿', '🇳🇦', '🇳🇨', '🇳🇪', '🇳🇫', '🇳🇬', '🇳🇮', '🇳🇱', '🇳🇴', '🇳🇵', '🇳🇷', '🇳🇺', '🇳🇿', '🇴🇲', '🇵🇦', '🇵🇪', '🇵🇫', '🇵🇬', '🇵🇭', '🇵🇰', '🇵🇱', '🇵🇲', '🇵🇳', '🇵🇷', '🇵🇸', '🇵🇹', '🇵🇼', '🇵🇾', '🇶🇦', '🇷🇪', '🇷🇴', '🇷🇸', '🇷🇺', '🇷🇼', '🇸🇦', '🇸🇧', '🇸🇨', '🇸🇩', '🇸🇪', '🇸🇬', '🇸🇭', '🇸🇮', '🇸🇯', '🇸🇰', '🇸🇱', '🇸🇲', '🇸🇳', '🇸🇴', '🇸🇷', '🇸🇸', '🇸🇹', '🇸🇻', '🇸🇽', '🇸🇾', '🇸🇿', '🇹🇦', '🇹🇨', '🇹🇩', '🇹🇫', '🇹🇬', '🇹🇭', '🇹🇯', '🇹🇰', '🇹🇱', '🇹🇲', '🇹🇳', '🇹🇴', '🇹🇷', '🇹🇹', '🇹🇻', '🇹🇼', '🇹🇿', '🇺🇦', '🇺🇬', '🇺🇲', '🇺🇸', '🇺🇾', '🇺🇿', '🇻🇦', '🇻🇨', '🇻🇪', '🇻🇬', '🇻🇮', '🇻🇳', '🇻🇺', '🇼🇫', '🇼🇸', '🇽🇰', '🇾🇪', '🇾🇹', '🇿🇦', '🇿🇲', '🇿🇼', '🏴‍☠️'],
};

// 카테고리 아이콘 (컬러 이모지 - 선택되지 않은 것은 desaturated)
const CATEGORY_ICONS: Record<EmojiCategory, string> = {
  recent: '⏰',
  people: '😊',
  animals: '🐻',
  food: '🍔',
  activity: '⚽️',
  travel: '🏙️',
  objects: '💡',
  symbols: '🎶',
  flags: '🚩',
};

// 카테고리 라벨
const CATEGORY_LABELS: Record<EmojiCategory, string> = {
  recent: '최근',
  people: '표정 및 사람',
  animals: '동물 및 자연',
  food: '음식 및 음료',
  activity: '활동',
  travel: '여행 및 장소',
  objects: '사물',
  symbols: '기호',
  flags: '깃발',
};

export default function CategoryCreateScreen() {
  const palette = colors.light;
  const router = useRouter();
  const { showToast } = useToast();
  const params = useLocalSearchParams<{ type?: string }>();
  const insets = useSafeAreaInsets();
  const {
    inputRef: categoryNameInputRef,
    hideBottomCta,
    onInputPressIn,
    onInputFocus,
    onInputBlur,
  } = useAndroidKeyboardBottomCtaHide();

  const categoryType = (params.type as CategoryType) || 'expense';

  const [categoryName, setCategoryName] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('✅');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<EmojiCategory>('recent');
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  useEffect(() => {
    if (!toastVisible) {
      return;
    }
    showToast(toastMessage);
    setToastVisible(false);
  }, [showToast, toastMessage, toastVisible]);
  const [emojiVersion, setEmojiVersion] = useState(0);
  const [emojiGridReady, setEmojiGridReady] = useState(false);
  const [pendingScrollCategory, setPendingScrollCategory] = useState<EmojiCategory | null>(null);
  const emojiScrollViewRef = useRef<FlashListRef<{ category: EmojiCategory; columns: string[][] }> | null>(null);
  const [emojiPickerMounted, setEmojiPickerMounted] = useState(false);
  
  const title = categoryType === 'expense' ? '지출 카테고리 생성' : '수입 카테고리 생성';

  // AsyncStorage에서 최근 이모지 로드
  useEffect(() => {
    const loadRecentEmojis = async () => {
      try {
        const stored = await AsyncStorage.getItem('recentEmojis');
        if (stored) {
          const recentEmojis = JSON.parse(stored) as string[];
          if (Array.isArray(recentEmojis)) {
            EMOJI_CATEGORIES.recent = recentEmojis;
            setEmojiVersion((v) => v + 1);
          }
        }
      } catch (error) {
        console.error('최근 이모지 로드 실패:', error);
      }
    };
    
    loadRecentEmojis();
    // 화면이 마운트되면 즉시 이모지 피커를 백그라운드에 마운트
    setEmojiPickerMounted(true);
  }, []);
  
  const handleBack = () => {
    router.back();
  };
  
  const handleEmojiPress = () => {
    // 바텀시트는 즉시 노출
    setShowEmojiPicker(true);
    // 포커스는 최근 카테고리로
    setSelectedCategory('recent');
    // 그리드를 바로 준비시키고 첫 위치로 스크롤 요청
    setEmojiGridReady(true);
    setPendingScrollCategory('recent');
  };
  
  const handleEmojiSelect = async (emoji: string) => {
    setSelectedEmoji(emoji);
    setShowEmojiPicker(false);
    
    // 최근 사용한 이모지를 recent 카테고리에 추가 (세로 3줄 최대 15개)
    const maxRecentEmojis = 15; // 세로 3줄로 최대 15개
    if (!EMOJI_CATEGORIES.recent.includes(emoji)) {
      EMOJI_CATEGORIES.recent.unshift(emoji);
      // 최대 15개를 초과하면 가장 오래된 이모지 제거
      if (EMOJI_CATEGORIES.recent.length > maxRecentEmojis) {
        EMOJI_CATEGORIES.recent.pop();
      }
      
      // AsyncStorage에 저장
      try {
        await AsyncStorage.setItem('recentEmojis', JSON.stringify(EMOJI_CATEGORIES.recent));
      } catch (error) {
        console.error('최근 이모지 저장 실패:', error);
      }
      
      setEmojiVersion((v) => v + 1);
    }
  };
  
  const handleCategorySelect = (category: EmojiCategory) => {
    setSelectedCategory(category);
    const index = visibleEmojiCategories.findIndex((item) => item.category === category);
    if (index >= 0) {
      if (!emojiGridReady || !emojiScrollViewRef.current) {
        if (!emojiGridReady) {
          setEmojiGridReady(true);
        }
        setPendingScrollCategory(category);
        return;
      }
      emojiScrollViewRef.current.scrollToIndex({
        index,
        animated: false,
      });
    }
  };
  
  // getCurrentEmojis는 더 이상 사용하지 않음 (모든 카테고리 표시)

  // 모든 카테고리의 이모지를 열 단위로 나누기 (메모이즈)
  const allEmojiCategories = useMemo(() => {
    const rowsPerColumn = Math.ceil(264 / 48); // 264px 높이에 맞는 행 수 (48px = EMOJI_ITEM_SIZE)
    const columnGap = 8; // 열 간 여백
    const categories: Array<{ category: EmojiCategory; columns: string[][] }> = [];
    const categoryKeys = Object.keys(EMOJI_CATEGORIES) as EmojiCategory[];
    
    categoryKeys.forEach((category) => {
      let emojis = EMOJI_CATEGORIES[category];
      
      // recent 카테고리는 세로 3줄(최대 15개)로 제한
      if (category === 'recent') {
        const maxRecentEmojis = 15; // 세로 3줄로 최대 15개
        emojis = emojis.slice(0, maxRecentEmojis);
      }
      
      const columns: string[][] = [];
      
      // recent 카테고리는 세로 3줄로 고정, 나머지는 기존 로직 사용
      const effectiveRowsPerColumn = category === 'recent' ? 3 : rowsPerColumn;
      
      // 열 수 계산
      const numColumns = Math.ceil(emojis.length / effectiveRowsPerColumn);
      
      // 각 열에 이모지 배치 (위에서 아래로 채우고, 한 열이 가득 차면 다음 열로)
      for (let col = 0; col < numColumns; col++) {
        const column: string[] = [];
        for (let row = 0; row < effectiveRowsPerColumn; row++) {
          const emojiIndex = col * effectiveRowsPerColumn + row;
          if (emojiIndex < emojis.length) {
            column.push(emojis[emojiIndex]);
          }
        }
        if (column.length > 0) {
          columns.push(column);
        }
      }
      
      categories.push({
        category,
        columns,
      });
    });
    
    return categories;
  }, [emojiVersion]);
  const visibleEmojiCategories = allEmojiCategories;

  // 카테고리 폭/오프셋 캐시 (고정 폭 힌트)
  const categoryLayouts = useMemo(() => {
    const layouts: Array<{ size: number; offset: number }> = [];
    let offset = 0;
    visibleEmojiCategories.forEach((item, index) => {
      const columns = item.columns.length;
      const sectionWidth = columns * 48; // 열 간 가로 gap 없음
      const gap = index < visibleEmojiCategories.length - 1 ? 12 : 0; // emojiGridContent gap
      const size = sectionWidth + gap;
      layouts.push({ size, offset });
      offset += size;
    });
    return layouts;
  }, [visibleEmojiCategories]);

  // 그리드 준비 후 펜딩된 스크롤 처리
  useEffect(() => {
    if (!emojiGridReady || !pendingScrollCategory || !emojiScrollViewRef.current) {
      return;
    }
    const index = visibleEmojiCategories.findIndex((item) => item.category === pendingScrollCategory);
    if (index >= 0) {
      emojiScrollViewRef.current.scrollToIndex({
        index,
        animated: false,
      });
    }
    setPendingScrollCategory(null);
  }, [emojiGridReady, pendingScrollCategory, visibleEmojiCategories]);
  
  const handleCreate = async () => {
    const trimmedName = categoryName.trim();

    // 유효성 검사
    if (!trimmedName) {
      setToastMessage('카테고리 이름을 입력해주세요.');
      setToastVisible(true);
      return;
    }
    if (trimmedName.length > 10) {
      setToastMessage('카테고리 이름은 10자 이하로 입력해주세요.');
      setToastVisible(true);
      return;
    }
    
    // 중복 체크 및 카테고리 생성
    try {
      const allCategories = await loadCategories(categoryType, { forceStorage: true });
      
      const isDuplicate = allCategories.some(
        cat => cat.label === trimmedName
      );
      
      if (isDuplicate) {
        setToastMessage('이미 존재하는 카테고리입니다.');
        setToastVisible(true);
        return;
      }
      
      // 카테고리 생성
      const newCategory = {
        emoji: selectedEmoji,
        label: trimmedName,
        type: categoryType,
      };
      
      // 통합 카테고리 리스트에 추가
      const updatedCategories = [...allCategories, newCategory];
      await saveCategories(categoryType, updatedCategories);
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      // 이전 화면으로 돌아가기
      router.back();
    } catch (error) {
      console.error('카테고리 생성 실패:', error);
      setToastMessage(error instanceof Error ? error.message : '카테고리 생성에 실패했습니다.');
      setToastVisible(true);
    }
  };
  
  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: palette.background, paddingTop: insets.top },
      ]}
      edges={['bottom']}
    >
      <StatusBar barStyle="dark-content" />

      <TopNavigation type="sub" title={title} showLeftIcon onLeftIconPress={handleBack} />

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={[styles.content, { backgroundColor: palette.fill }]}>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
            overScrollMode="never"
          >
            {/* Emoji Selection */}
            <View style={styles.emojiSection}>
              <Pressable
                style={[styles.emojiButton, { borderColor: palette.border }]}
                onPress={handleEmojiPress}
                accessibilityRole="button"
                accessibilityLabel="이모지 선택"
              >
                <Text style={styles.emojiText}>{selectedEmoji}</Text>
              </Pressable>
            </View>
            
            {/* Category Name Input */}
            <View style={styles.inputSection}>
              <Text style={[styles.label, { color: palette.text }]}>
                카테고리 이름
              </Text>
              <Input
                ref={categoryNameInputRef}
                value={categoryName}
                onChangeText={setCategoryName}
                placeholder="이름 입력"
                style={styles.input}
                autoFocus={false}
                maxLength={10}
                onPressIn={onInputPressIn}
                onFocus={onInputFocus}
                onBlur={onInputBlur}
              />
            </View>
          </ScrollView>
        </View>
      </TouchableWithoutFeedback>
      
      {/* 하단 고정 버튼 (Android 키보드 시 숨김) */}
      {!hideBottomCta && (
      <View
        style={[
          styles.bottomButtonContainer,
          { backgroundColor: palette.staticWhite },
        ]}
      >
        <Button onPress={handleCreate}>
          생성
        </Button>
      </View>
      )}
      
      {/* Emoji Picker Modal - 미리 마운트해두고 visible만 토글 */}
      {emojiPickerMounted && (
        <ModalBottomsheet
          visible={showEmojiPicker}
          title="카테고리 이모지 선택"
          onClose={() => setShowEmojiPicker(false)}
          contentStyle={styles.emojiPickerContent}
          noPaddingBottom={true}
        >
        <View style={styles.emojiPickerContainer}>
          <View style={styles.emojiPickerContentWrapper}>
            {/* 왼쪽 카테고리 세로 리스트 */}
            <View style={styles.categoryListContainer}>
              <ScrollView
                style={styles.categoryListScroll}
                contentContainerStyle={styles.categoryListScrollContent}
                showsVerticalScrollIndicator={false}
                bounces={false}
                overScrollMode="never"
              >
                {(Object.keys(EMOJI_CATEGORIES) as EmojiCategory[]).map((category) => (
                  <Pressable
                    key={category}
                    style={[
                      styles.categoryListItem,
                      selectedCategory === category && styles.categoryListItemActive,
                    ]}
                    onPress={() => handleCategorySelect(category)}
                    accessibilityRole="button"
                    accessibilityLabel={CATEGORY_LABELS[category]}
                  >
                    <Text 
                      style={[
                        styles.categoryListItemText,
                        selectedCategory === category && styles.categoryListItemTextActive,
                      ]}
                    >
                      {CATEGORY_LABELS[category]}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
            
            {/* 오른쪽 이모지 그리드 */}
            <View style={{ width: '100%', height: 264 }}>
              {emojiGridReady ? (
                <FlashList<{ category: EmojiCategory; columns: string[][] }>
                  ref={emojiScrollViewRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  bounces={false}
                  data={visibleEmojiCategories}
                  contentContainerStyle={styles.emojiGridContent}
                  keyExtractor={(item) => item.category}
                  overrideItemLayout={(layout, _item, index) => {
                    const info = categoryLayouts[index];
                    const layoutAny = layout as unknown as { size: number; offset: number };
                    layoutAny.size = info?.size ?? 0;
                    layoutAny.offset = info?.offset ?? 0;
                  }}
                  renderItem={({ item: categoryData, index }) => (
                    <View
                      style={[
                        styles.categorySection,
                        index < visibleEmojiCategories.length - 1 && { marginRight: 12 },
                      ]}
                    >
                      {categoryData.columns.map((column, colIndex) => (
                        <View key={`${categoryData.category}-column-${colIndex}`} style={styles.emojiColumn}>
                          {column.map((emoji, rowIndex) => (
                            <Pressable
                              key={`${categoryData.category}-${colIndex}-${rowIndex}`}
                              style={styles.emojiItem}
                              onPress={() => handleEmojiSelect(emoji)}
                              accessibilityRole="button"
                              accessibilityLabel={`이모지 ${emoji} 선택`}
                            >
                              <Text style={styles.emojiItemText}>{emoji}</Text>
                            </Pressable>
                          ))}
                        </View>
                      ))}
                    </View>
                  )}
                />
              ) : null}
              {!emojiGridReady && (
                <View style={[styles.emojiGrid, styles.emojiGridSkeleton, { position: 'absolute', top: 0, left: 0 }]}>
                  <ActivityIndicator />
                </View>
              )}
            </View>
          </View>
          
          {/* 홈 인디케이터 영역 */}
          <View style={[styles.homeIndicatorContainer, { height: insets.bottom || 34 }]} />
        </View>
      </ModalBottomsheet>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 16,
  },
  emojiSection: {
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 40,
  },
  emojiButton: {
    width: 128,
    height: 128,
    borderRadius: 96,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.light.staticWhite,
  },
  emojiText: typographyLayout.categoryEmojiMedium,
  inputSection: {
    marginBottom: 24,
  },
  label: {
    ...typography.body1.l.bold,
    marginBottom: 8,
  },
  input: {
    marginTop: 0,
  },
  bottomButtonContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  emojiPickerContent: {
    padding: 8,
  },
  emojiPickerContainer: {
    backgroundColor: colors.light.staticWhite,
  },
  emojiPickerContentWrapper: {
    height: 264,
    flexDirection: 'row',
  },
  categoryListContainer: {
    width: 92,
    overflow: 'hidden',
    marginRight: 16,
  },
  categoryListScroll: {
    height: 264,
  },
  categoryListScrollContent: {
    paddingTop: 0,
  },
  categoryListItem: {
    height: 37,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: 12,
    backgroundColor: colors.light.staticWhite,
    marginVertical: 2,
  },
  categoryListItemActive: {
    backgroundColor: '#ededed',
  },
  categoryListItemText: {
    ...typography.body1.l.regular,
    color: colors.light.text,
  },
  categoryListItemTextActive: {
    color: colors.light.text,
  },
  emojiGrid: {
    height: 264,
    width: '100%',
  },
  emojiGridSkeleton: {
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  emojiGridContent: {
    flexDirection: 'row',
    gap: 12,
  },
  categorySection: {
    flexDirection: 'row',
  },
  emojiColumn: {
    flexDirection: 'column',
    gap: 8,
  },
  emojiItem: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiItemText: typographyLayout.categoryEmojiLarge,
  homeIndicatorContainer: {
    width: '100%',
  },
});
