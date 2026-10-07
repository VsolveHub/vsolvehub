# Landing Screen Style & Property Parity Diff

> Generated: 2026-10-06T21:54:28.721Z
> Comparing Web (http://localhost:3001) vs Mobile RN-Web (http://localhost:8081) at 390x844 (DPR 3)

| Section | Element | Property | Web | Mobile | Delta | Severity |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| nav | container | container.tag | `HEADER` | `BUTTON` | HEADER vs BUTTON | **Minor** |
| nav | container | container.textStyles.fontFamily | `"Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | `"Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` | "Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif vs "Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif | **Minor** |
| nav | container | container.textStyles.textAlign | `start` | `center` | start vs center | **Minor** |
| nav | container | container.boxStyles.width | `366px` | `57px` | 309.0px (366px -> 57px) | **Major** |
| nav | container | container.boxStyles.height | `66px` | `44px` | 22.0px (66px -> 44px) | **Major** |
| nav | container | container.boxStyles.padding | `10px 14px 10px 14px` | `0px 0px 0px 0px` | 10.0px (10px 14px 10px 14px -> 0px 0px 0px 0px) | **Minor** |
| nav | container | container.boxStyles.border | `1px solid rgb(117, 108, 94)` | `0px solid rgb(0, 0, 0)` | 1px solid rgb(117, 108, 94) vs 0px solid rgb(0, 0, 0) | **Minor** |
| nav | container | container.boxStyles.borderRadius | `16px` | `9999px` | 9983.0px (16px -> 9999px) | **Minor** |
| nav | container | container.boxStyles.backgroundColor | `oklab(0.999994 0.0000455678 0.0000200868 / 0.95)` | `rgba(0, 0, 0, 0)` | oklab(0.999994 0.0000455678 0.0000200868 / 0.95) vs rgba(0, 0, 0, 0) | **Major** |
| nav | container | container.boxStyles.boxShadow | `rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 17, 46, 0.12) 0px 12px 32px 0px, rgba(0, 0, 0, 0.05) 0px 1px 3px 0px` | `rgba(248, 112, 0, 0.3) 0px 4px 6px 0px` | rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 17, 46, 0.12) 0px 12px 32px 0px, rgba(0, 0, 0, 0.05) 0px 1px 3px 0px vs rgba(248, 112, 0, 0.3) 0px 4px 6px 0px | **Minor** |
| nav | container | container.boxStyles.overflow | `visible` | `hidden` | visible vs hidden | **Minor** |
| nav | container | container.boxStyles.backdropFilter | `blur(40px)` | `none` | blur(40px) vs none | **Minor** |
| nav | container | container.layout.display | `block` | `flex` | block vs flex | **Minor** |
| nav | container | container.layout.flexDirection | `row` | `column` | row vs column | **Minor** |
| nav | container | container.layout.alignItems | `normal` | `stretch` | normal vs stretch | **Minor** |
| nav | container | container.layout.position | `static` | `relative` | static vs relative | **Minor** |
| nav | container | container.layout.zIndex | `auto` | `0` | auto vs 0 | **Minor** |
| nav | container | container.layout.boundingRect.x | `12` | `258` | 12 vs 258 | **Minor** |
| nav | container | container.layout.boundingRect.y | `12` | `23` | 12 vs 23 | **Minor** |
| nav | container | container.layout.boundingRect.width | `366` | `57` | 366 vs 57 | **Minor** |
| nav | container | container.layout.boundingRect.height | `66` | `44` | 66 vs 44 | **Minor** |
| nav | container | container.animation.name | `none` | `NOT MEASURED` | none vs NOT MEASURED | **Minor** |
| nav | container | container.animation.duration | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| nav | container | container.animation.timingFunction | `ease` | `NOT MEASURED` | ease vs NOT MEASURED | **Minor** |
| nav | container | container.animation.delay | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| nav | joinBtn | joinBtn.tag | `A` | `DIV` | A vs DIV | **Minor** |
| nav | joinBtn | joinBtn.textStyles.fontFamily | `"Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | `"Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | "Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif vs "Plus Jakarta Sans", system-ui, -apple-system, sans-serif | **Minor** |
| nav | joinBtn | joinBtn.textStyles.textAlign | `start` | `center` | start vs center | **Minor** |
| nav | joinBtn | joinBtn.boxStyles.width | `54.9px` | `57px` | 2.1px (54.9px -> 57px) | **Minor** |
| nav | joinBtn | joinBtn.boxStyles.border | `0px solid rgb(0, 17, 46)` | `0px solid rgb(0, 0, 0)` | 0px solid rgb(0, 17, 46) vs 0px solid rgb(0, 0, 0) | **Minor** |
| nav | joinBtn | joinBtn.boxStyles.borderRadius | `3.35544e+07px` | `9999px` | 33544401.0px (3.35544e+07px -> 9999px) | **Minor** |
| nav | joinBtn | joinBtn.boxStyles.backgroundImage | `linear-gradient(to right, rgb(248, 112, 0) 0%, lab(72.7183 31.8672 97.9407) 50%, rgb(251, 129, 48) 100%)` | `linear-gradient(90deg, rgb(248, 112, 0), rgb(245, 158, 11), rgb(251, 146, 60))` | linear-gradient(to right, rgb(248, 112, 0) 0%, lab(72.7183 31.8672 97.9407) 50%, rgb(251, 129, 48) 100%) vs linear-gradient(90deg, rgb(248, 112, 0), rgb(245, 158, 11), rgb(251, 146, 60)) | **Minor** |
| nav | joinBtn | joinBtn.boxStyles.boxShadow | `rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, oklab(0.698677 0.127265 0.14141 / 0.3) 0px 4px 6px -1px, oklab(0.698677 0.127265 0.14141 / 0.3) 0px 2px 4px -2px` | `none` | rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, oklab(0.698677 0.127265 0.14141 / 0.3) 0px 4px 6px -1px, oklab(0.698677 0.127265 0.14141 / 0.3) 0px 2px 4px -2px vs none | **Minor** |
| nav | joinBtn | joinBtn.layout.justifyContent | `normal` | `center` | normal vs center | **Minor** |
| nav | joinBtn | joinBtn.layout.zIndex | `auto` | `0` | auto vs 0 | **Minor** |
| nav | joinBtn | joinBtn.layout.boundingRect.x | `256` | `258` | 256 vs 258 | **Minor** |
| nav | joinBtn | joinBtn.layout.boundingRect.width | `55` | `57` | 55 vs 57 | **Minor** |
| nav | joinBtn | joinBtn.animation.name | `none` | `NOT MEASURED` | none vs NOT MEASURED | **Minor** |
| nav | joinBtn | joinBtn.animation.duration | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| nav | joinBtn | joinBtn.animation.timingFunction | `ease` | `NOT MEASURED` | ease vs NOT MEASURED | **Minor** |
| nav | joinBtn | joinBtn.animation.delay | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| hero | tag | tag.tag | `SPAN` | `DIV` | SPAN vs DIV | **Minor** |
| hero | tag | tag.textStyles.fontFamily | `"Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | `"Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | "Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif vs "Plus Jakarta Sans", system-ui, -apple-system, sans-serif | **Minor** |
| hero | tag | tag.boxStyles.border | `0px solid rgb(251, 129, 48)` | `0px solid rgb(0, 0, 0)` | 0px solid rgb(251, 129, 48) vs 0px solid rgb(0, 0, 0) | **Minor** |
| hero | tag | tag.layout.position | `static` | `relative` | static vs relative | **Minor** |
| hero | tag | tag.layout.boundingRect.y | `-10364` | `100` | -10364 vs 100 | **Minor** |
| hero | tag | tag.animation.name | `none` | `NOT MEASURED` | none vs NOT MEASURED | **Minor** |
| hero | tag | tag.animation.duration | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| hero | tag | tag.animation.timingFunction | `ease` | `NOT MEASURED` | ease vs NOT MEASURED | **Minor** |
| hero | tag | tag.animation.delay | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| hero | headingWhite | headingWhite.tag | `SPAN` | `DIV` | SPAN vs DIV | **Minor** |
| hero | headingWhite | headingWhite.textStyles.fontFamily | `"Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | `"Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | "Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif vs "Plus Jakarta Sans", system-ui, -apple-system, sans-serif | **Minor** |
| hero | headingWhite | headingWhite.boxStyles.border | `0px solid rgb(255, 255, 255)` | `0px solid rgb(0, 0, 0)` | 0px solid rgb(255, 255, 255) vs 0px solid rgb(0, 0, 0) | **Minor** |
| hero | headingWhite | headingWhite.layout.position | `static` | `relative` | static vs relative | **Minor** |
| hero | headingWhite | headingWhite.layout.boundingRect.y | `-10320` | `144` | -10320 vs 144 | **Minor** |
| hero | headingWhite | headingWhite.animation.name | `none` | `NOT MEASURED` | none vs NOT MEASURED | **Minor** |
| hero | headingWhite | headingWhite.animation.duration | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| hero | headingWhite | headingWhite.animation.timingFunction | `ease` | `NOT MEASURED` | ease vs NOT MEASURED | **Minor** |
| hero | headingWhite | headingWhite.animation.delay | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| hero | headingOrange | headingOrange.tag | `SPAN` | `DIV` | SPAN vs DIV | **Minor** |
| hero | headingOrange | headingOrange.textStyles.fontFamily | `"Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | `"Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | "Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif vs "Plus Jakarta Sans", system-ui, -apple-system, sans-serif | **Minor** |
| hero | headingOrange | headingOrange.boxStyles.border | `0px solid rgb(248, 112, 0)` | `0px solid rgb(0, 0, 0)` | 0px solid rgb(248, 112, 0) vs 0px solid rgb(0, 0, 0) | **Minor** |
| hero | headingOrange | headingOrange.layout.position | `static` | `relative` | static vs relative | **Minor** |
| hero | headingOrange | headingOrange.layout.boundingRect.y | `-10245` | `219` | -10245 vs 219 | **Minor** |
| hero | headingOrange | headingOrange.animation.name | `none` | `NOT MEASURED` | none vs NOT MEASURED | **Minor** |
| hero | headingOrange | headingOrange.animation.duration | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| hero | headingOrange | headingOrange.animation.timingFunction | `ease` | `NOT MEASURED` | ease vs NOT MEASURED | **Minor** |
| hero | headingOrange | headingOrange.animation.delay | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| hero | subtitle | subtitle.tag | `P` | `DIV` | P vs DIV | **Minor** |
| hero | subtitle | subtitle.textStyles.fontFamily | `"Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | `"Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | "Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif vs "Plus Jakarta Sans", system-ui, -apple-system, sans-serif | **Minor** |
| hero | subtitle | subtitle.textStyles.color | `oklab(0.999994 0.0000455678 0.0000200868 / 0.72)` | `rgba(255, 255, 255, 0.72)` | oklab(0.999994 0.0000455678 0.0000200868 / 0.72) vs rgba(255, 255, 255, 0.72) | **Major** |
| hero | subtitle | subtitle.boxStyles.border | `0px solid oklab(0.999994 0.0000455678 0.0000200868 / 0.72)` | `0px solid rgb(0, 0, 0)` | 0px solid oklab(0.999994 0.0000455678 0.0000200868 / 0.72) vs 0px solid rgb(0, 0, 0) | **Minor** |
| hero | subtitle | subtitle.layout.position | `static` | `relative` | static vs relative | **Minor** |
| hero | subtitle | subtitle.layout.boundingRect.y | `-10183` | `281` | -10183 vs 281 | **Minor** |
| hero | subtitle | subtitle.animation.name | `none` | `NOT MEASURED` | none vs NOT MEASURED | **Minor** |
| hero | subtitle | subtitle.animation.duration | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| hero | subtitle | subtitle.animation.timingFunction | `ease` | `NOT MEASURED` | ease vs NOT MEASURED | **Minor** |
| hero | subtitle | subtitle.animation.delay | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| hero | input | input.textStyles.fontFamily | `"Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | `"Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | "Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif vs "Plus Jakarta Sans", system-ui, -apple-system, sans-serif | **Minor** |
| hero | input | input.layout.display | `inline-block` | `block` | inline-block vs block | **Minor** |
| hero | input | input.layout.boundingRect.y | `-10105` | `367` | -10105 vs 367 | **Minor** |
| hero | input | input.animation.name | `none` | `NOT MEASURED` | none vs NOT MEASURED | **Minor** |
| hero | input | input.animation.duration | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| hero | input | input.animation.timingFunction | `ease` | `NOT MEASURED` | ease vs NOT MEASURED | **Minor** |
| hero | input | input.animation.delay | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| hero | applyBtn | applyBtn.text | `Apply Now` | `NOT MEASURED` | Apply Now vs NOT MEASURED | **Minor** |
| hero | applyBtn | applyBtn.textStyles.fontFamily | `"Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | `"Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | "Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif vs "Plus Jakarta Sans", system-ui, -apple-system, sans-serif | **Minor** |
| hero | applyBtn | applyBtn.boxStyles.border | `0px solid rgb(0, 17, 46)` | `0px solid rgb(0, 0, 0)` | 0px solid rgb(0, 17, 46) vs 0px solid rgb(0, 0, 0) | **Minor** |
| hero | applyBtn | applyBtn.boxStyles.boxShadow | `rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.1) 0px 4px 6px -1px, rgba(0, 0, 0, 0.1) 0px 2px 4px -2px` | `rgba(0, 0, 0, 0.1) 0px 4px 6px 0px` | rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.1) 0px 4px 6px -1px, rgba(0, 0, 0, 0.1) 0px 2px 4px -2px vs rgba(0, 0, 0, 0.1) 0px 4px 6px 0px | **Minor** |
| hero | applyBtn | applyBtn.layout.position | `static` | `relative` | static vs relative | **Minor** |
| hero | applyBtn | applyBtn.layout.zIndex | `auto` | `0` | auto vs 0 | **Minor** |
| hero | applyBtn | applyBtn.layout.boundingRect.y | `-10041` | `427` | -10041 vs 427 | **Minor** |
| hero | applyBtn | applyBtn.animation.name | `none` | `NOT MEASURED` | none vs NOT MEASURED | **Minor** |
| hero | applyBtn | applyBtn.animation.duration | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| hero | applyBtn | applyBtn.animation.timingFunction | `ease` | `NOT MEASURED` | ease vs NOT MEASURED | **Minor** |
| hero | applyBtn | applyBtn.animation.delay | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| hero | otpNote | otpNote.textStyles.fontFamily | `"Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | `"Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` | "Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif vs "Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif | **Minor** |
| hero | otpNote | otpNote.textStyles.color | `oklab(0.999994 0.0000455677 0.0000200868 / 0.7)` | `rgba(255, 255, 255, 0.7)` | oklab(0.999994 0.0000455677 0.0000200868 / 0.7) vs rgba(255, 255, 255, 0.7) | **Major** |
| hero | otpNote | otpNote.boxStyles.border | `0px solid oklab(0.999994 0.0000455677 0.0000200868 / 0.7)` | `0px solid rgb(0, 0, 0)` | 0px solid oklab(0.999994 0.0000455677 0.0000200868 / 0.7) vs 0px solid rgb(0, 0, 0) | **Minor** |
| hero | otpNote | otpNote.layout.position | `static` | `relative` | static vs relative | **Minor** |
| hero | otpNote | otpNote.layout.zIndex | `auto` | `0` | auto vs 0 | **Minor** |
| hero | otpNote | otpNote.layout.boundingRect.y | `-9981` | `487` | -9981 vs 487 | **Minor** |
| hero | otpNote | otpNote.animation.name | `none` | `NOT MEASURED` | none vs NOT MEASURED | **Minor** |
| hero | otpNote | otpNote.animation.duration | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| hero | otpNote | otpNote.animation.timingFunction | `ease` | `NOT MEASURED` | ease vs NOT MEASURED | **Minor** |
| hero | otpNote | otpNote.animation.delay | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| hero | signInBox | signInBox.textStyles.fontFamily | `"Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | `"Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` | "Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif vs "Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif | **Minor** |
| hero | signInBox | signInBox.textStyles.color | `rgb(255, 255, 255)` | `rgb(0, 17, 46)` | rgb(255, 255, 255) vs rgb(0, 17, 46) | **Major** |
| hero | signInBox | signInBox.boxStyles.border | `1px solid oklab(0.999994 0.0000455678 0.0000200868 / 0.15)` | `1px solid rgba(255, 255, 255, 0.15)` | 1px solid oklab(0.999994 0.0000455678 0.0000200868 / 0.15) vs 1px solid rgba(255, 255, 255, 0.15) | **Minor** |
| hero | signInBox | signInBox.boxStyles.backgroundColor | `oklab(0.999994 0.0000455678 0.0000200868 / 0.1)` | `rgba(255, 255, 255, 0.1)` | oklab(0.999994 0.0000455678 0.0000200868 / 0.1) vs rgba(255, 255, 255, 0.1) | **Major** |
| hero | signInBox | signInBox.layout.justifyContent | `normal` | `space-between` | normal vs space-between | **Minor** |
| hero | signInBox | signInBox.layout.position | `static` | `relative` | static vs relative | **Minor** |
| hero | signInBox | signInBox.layout.zIndex | `auto` | `0` | auto vs 0 | **Minor** |
| hero | signInBox | signInBox.layout.boundingRect.y | `-9945` | `523` | -9945 vs 523 | **Minor** |
| hero | signInBox | signInBox.animation.name | `none` | `NOT MEASURED` | none vs NOT MEASURED | **Minor** |
| hero | signInBox | signInBox.animation.duration | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| hero | signInBox | signInBox.animation.timingFunction | `ease` | `NOT MEASURED` | ease vs NOT MEASURED | **Minor** |
| hero | signInBox | signInBox.animation.delay | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| hero | signInBtn | signInBtn.tag | `A` | `BUTTON` | A vs BUTTON | **Minor** |
| hero | signInBtn | signInBtn.textStyles.fontFamily | `"Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | `"Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | "Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif vs "Plus Jakarta Sans", system-ui, -apple-system, sans-serif | **Minor** |
| hero | signInBtn | signInBtn.textStyles.textAlign | `start` | `center` | start vs center | **Minor** |
| hero | signInBtn | signInBtn.boxStyles.width | `66.6px` | `68.8px` | 2.2px (66.6px -> 68.8px) | **Minor** |
| hero | signInBtn | signInBtn.boxStyles.border | `0px solid rgb(0, 17, 46)` | `0px solid rgb(0, 0, 0)` | 0px solid rgb(0, 17, 46) vs 0px solid rgb(0, 0, 0) | **Minor** |
| hero | signInBtn | signInBtn.boxStyles.borderRadius | `3.35544e+07px` | `9999px` | 33544401.0px (3.35544e+07px -> 9999px) | **Minor** |
| hero | signInBtn | signInBtn.boxStyles.boxShadow | `rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.1) 0px 1px 3px 0px, rgba(0, 0, 0, 0.1) 0px 1px 2px -1px` | `rgba(0, 0, 0, 0.1) 0px 1px 3px 0px` | rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.1) 0px 1px 3px 0px, rgba(0, 0, 0, 0.1) 0px 1px 2px -1px vs rgba(0, 0, 0, 0.1) 0px 1px 3px 0px | **Minor** |
| hero | signInBtn | signInBtn.layout.flexDirection | `row` | `column` | row vs column | **Minor** |
| hero | signInBtn | signInBtn.layout.justifyContent | `normal` | `center` | normal vs center | **Minor** |
| hero | signInBtn | signInBtn.layout.position | `static` | `relative` | static vs relative | **Minor** |
| hero | signInBtn | signInBtn.layout.zIndex | `auto` | `0` | auto vs 0 | **Minor** |
| hero | signInBtn | signInBtn.layout.boundingRect.x | `223` | `284` | 223 vs 284 | **Minor** |
| hero | signInBtn | signInBtn.layout.boundingRect.y | `-9934` | `534` | -9934 vs 534 | **Minor** |
| hero | signInBtn | signInBtn.layout.boundingRect.width | `67` | `69` | 67 vs 69 | **Minor** |
| hero | signInBtn | signInBtn.animation.name | `none` | `NOT MEASURED` | none vs NOT MEASURED | **Minor** |
| hero | signInBtn | signInBtn.animation.duration | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| hero | signInBtn | signInBtn.animation.timingFunction | `ease` | `NOT MEASURED` | ease vs NOT MEASURED | **Minor** |
| hero | signInBtn | signInBtn.animation.delay | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| how-it-works | section | section.tag | `SECTION` | `DIV` | SECTION vs DIV | **Minor** |
| how-it-works | section | section.textStyles.fontFamily | `"Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | `"Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` | "Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif vs "Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif | **Minor** |
| how-it-works | section | section.textStyles.textAlign | `start` | `center` | start vs center | **Minor** |
| how-it-works | section | section.textStyles.color | `rgb(0, 17, 46)` | `rgb(169, 73, 0)` | rgb(0, 17, 46) vs rgb(169, 73, 0) | **Major** |
| how-it-works | section | section.boxStyles.width | `390px` | `183px` | 207.0px (390px -> 183px) | **Major** |
| how-it-works | section | section.boxStyles.height | `1749.8px` | `26px` | 1723.8px (1749.8px -> 26px) | **Major** |
| how-it-works | section | section.boxStyles.padding | `96px 16px 96px 16px` | `4px 14px 4px 14px` | 92.0px (96px 16px 96px 16px -> 4px 14px 4px 14px) | **Minor** |
| how-it-works | section | section.boxStyles.gap | `normal` | `6px` | normal vs 6px | **Minor** |
| how-it-works | section | section.boxStyles.border | `0px solid rgb(0, 17, 46)` | `1px solid rgb(255, 196, 160)` | 0px solid rgb(0, 17, 46) vs 1px solid rgb(255, 196, 160) | **Minor** |
| how-it-works | section | section.boxStyles.borderRadius | `0px` | `9999px` | 9999.0px (0px -> 9999px) | **Minor** |
| how-it-works | section | section.boxStyles.backgroundColor | `rgb(255, 255, 255)` | `rgb(255, 244, 236)` | rgb(255, 255, 255) vs rgb(255, 244, 236) | **Major** |
| how-it-works | section | section.boxStyles.boxShadow | `none` | `rgba(0, 0, 0, 0.05) 0px 1px 2px 0px` | none vs rgba(0, 0, 0, 0.05) 0px 1px 2px 0px | **Minor** |
| how-it-works | section | section.boxStyles.overflow | `hidden` | `visible` | hidden vs visible | **Minor** |
| how-it-works | section | section.layout.display | `block` | `flex` | block vs flex | **Minor** |
| how-it-works | section | section.layout.alignItems | `normal` | `center` | normal vs center | **Minor** |
| how-it-works | section | section.layout.zIndex | `auto` | `0` | auto vs 0 | **Minor** |
| how-it-works | section | section.layout.boundingRect.x | `0` | `104` | 0 vs 104 | **Minor** |
| how-it-works | section | section.layout.boundingRect.y | `-8973` | `1628` | -8973 vs 1628 | **Minor** |
| how-it-works | section | section.layout.boundingRect.width | `390` | `183` | 390 vs 183 | **Minor** |
| how-it-works | section | section.layout.boundingRect.height | `1750` | `26` | 1750 vs 26 | **Minor** |
| how-it-works | section | section.animation.name | `none` | `NOT MEASURED` | none vs NOT MEASURED | **Minor** |
| how-it-works | section | section.animation.duration | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| how-it-works | section | section.animation.timingFunction | `ease` | `NOT MEASURED` | ease vs NOT MEASURED | **Minor** |
| how-it-works | section | section.animation.delay | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| how-it-works | badge | badge.tag | `SPAN` | `DIV` | SPAN vs DIV | **Minor** |
| how-it-works | badge | badge.textStyles.fontFamily | `"Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | `"Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` | "Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif vs "Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif | **Minor** |
| how-it-works | badge | badge.textStyles.fontSize | `12px` | `16px` | 4.0px (12px -> 16px) | **Major** |
| how-it-works | badge | badge.textStyles.fontWeight | `800` | `400` | 800 vs 400 | **Minor** |
| how-it-works | badge | badge.textStyles.lineHeight | `16px` | `24px` | 8.0px (16px -> 24px) | **Major** |
| how-it-works | badge | badge.boxStyles.width | `184px` | `183px` | 1.0px (184px -> 183px) | **Minor** |
| how-it-works | badge | badge.boxStyles.borderRadius | `3.35544e+07px` | `9999px` | 33544401.0px (3.35544e+07px -> 9999px) | **Minor** |
| how-it-works | badge | badge.boxStyles.boxShadow | `rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.05) 0px 1px 2px 0px` | `rgba(0, 0, 0, 0.05) 0px 1px 2px 0px` | rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.05) 0px 1px 2px 0px vs rgba(0, 0, 0, 0.05) 0px 1px 2px 0px | **Minor** |
| how-it-works | badge | badge.layout.display | `inline-flex` | `flex` | inline-flex vs flex | **Minor** |
| how-it-works | badge | badge.layout.position | `static` | `relative` | static vs relative | **Minor** |
| how-it-works | badge | badge.layout.zIndex | `auto` | `0` | auto vs 0 | **Minor** |
| how-it-works | badge | badge.layout.boundingRect.x | `103` | `104` | 103 vs 104 | **Minor** |
| how-it-works | badge | badge.layout.boundingRect.y | `-8877` | `1628` | -8877 vs 1628 | **Minor** |
| how-it-works | badge | badge.layout.boundingRect.width | `184` | `183` | 184 vs 183 | **Minor** |
| how-it-works | badge | badge.animation.name | `none` | `NOT MEASURED` | none vs NOT MEASURED | **Minor** |
| how-it-works | badge | badge.animation.duration | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| how-it-works | badge | badge.animation.timingFunction | `ease` | `NOT MEASURED` | ease vs NOT MEASURED | **Minor** |
| how-it-works | badge | badge.animation.delay | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| how-it-works | heading | heading.tag | `H2` | `DIV` | H2 vs DIV | **Minor** |
| how-it-works | heading | heading.textStyles.fontFamily | `"Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | `"Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | "Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif vs "Plus Jakarta Sans", system-ui, -apple-system, sans-serif | **Minor** |
| how-it-works | heading | heading.boxStyles.border | `0px solid rgb(0, 17, 46)` | `0px solid rgb(0, 0, 0)` | 0px solid rgb(0, 17, 46) vs 0px solid rgb(0, 0, 0) | **Minor** |
| how-it-works | heading | heading.layout.position | `static` | `relative` | static vs relative | **Minor** |
| how-it-works | heading | heading.layout.boundingRect.y | `-8835` | `1670` | -8835 vs 1670 | **Minor** |
| how-it-works | heading | heading.animation.name | `none` | `NOT MEASURED` | none vs NOT MEASURED | **Minor** |
| how-it-works | heading | heading.animation.duration | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| how-it-works | heading | heading.animation.timingFunction | `ease` | `NOT MEASURED` | ease vs NOT MEASURED | **Minor** |
| how-it-works | heading | heading.animation.delay | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| platform-advantages | section | section.tag | `SECTION` | `DIV` | SECTION vs DIV | **Minor** |
| platform-advantages | section | section.textStyles.fontFamily | `"Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | `"Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` | "Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif vs "Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif | **Minor** |
| platform-advantages | section | section.textStyles.textAlign | `start` | `center` | start vs center | **Minor** |
| platform-advantages | section | section.boxStyles.width | `390px` | `176px` | 214.0px (390px -> 176px) | **Major** |
| platform-advantages | section | section.boxStyles.height | `1650.5px` | `26px` | 1624.5px (1650.5px -> 26px) | **Major** |
| platform-advantages | section | section.boxStyles.padding | `96px 16px 96px 16px` | `4px 14px 4px 14px` | 92.0px (96px 16px 96px 16px -> 4px 14px 4px 14px) | **Minor** |
| platform-advantages | section | section.boxStyles.gap | `normal` | `6px` | normal vs 6px | **Minor** |
| platform-advantages | section | section.boxStyles.border | `1px solid rgb(231, 226, 218)` | `1px solid rgba(0, 17, 46, 0.15)` | 1px solid rgb(231, 226, 218) vs 1px solid rgba(0, 17, 46, 0.15) | **Minor** |
| platform-advantages | section | section.boxStyles.borderRadius | `0px` | `9999px` | 9999.0px (0px -> 9999px) | **Minor** |
| platform-advantages | section | section.boxStyles.backgroundColor | `oklab(0.959068 0.00123698 0.00732243 / 0.5)` | `rgb(224, 231, 255)` | oklab(0.959068 0.00123698 0.00732243 / 0.5) vs rgb(224, 231, 255) | **Major** |
| platform-advantages | section | section.boxStyles.boxShadow | `none` | `rgba(0, 0, 0, 0.05) 0px 1px 2px 0px` | none vs rgba(0, 0, 0, 0.05) 0px 1px 2px 0px | **Minor** |
| platform-advantages | section | section.boxStyles.overflow | `hidden` | `visible` | hidden vs visible | **Minor** |
| platform-advantages | section | section.layout.display | `block` | `flex` | block vs flex | **Minor** |
| platform-advantages | section | section.layout.alignItems | `normal` | `center` | normal vs center | **Minor** |
| platform-advantages | section | section.layout.zIndex | `auto` | `0` | auto vs 0 | **Minor** |
| platform-advantages | section | section.layout.boundingRect.x | `0` | `107` | 0 vs 107 | **Minor** |
| platform-advantages | section | section.layout.boundingRect.y | `-7223` | `3055` | -7223 vs 3055 | **Minor** |
| platform-advantages | section | section.layout.boundingRect.width | `390` | `176` | 390 vs 176 | **Minor** |
| platform-advantages | section | section.layout.boundingRect.height | `1651` | `26` | 1651 vs 26 | **Minor** |
| platform-advantages | section | section.animation.name | `none` | `NOT MEASURED` | none vs NOT MEASURED | **Minor** |
| platform-advantages | section | section.animation.duration | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| platform-advantages | section | section.animation.timingFunction | `ease` | `NOT MEASURED` | ease vs NOT MEASURED | **Minor** |
| platform-advantages | section | section.animation.delay | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| platform-advantages | badge | badge.tag | `SPAN` | `DIV` | SPAN vs DIV | **Minor** |
| platform-advantages | badge | badge.textStyles.fontFamily | `"Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | `"Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` | "Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif vs "Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif | **Minor** |
| platform-advantages | badge | badge.textStyles.fontSize | `12px` | `16px` | 4.0px (12px -> 16px) | **Major** |
| platform-advantages | badge | badge.textStyles.fontWeight | `800` | `400` | 800 vs 400 | **Minor** |
| platform-advantages | badge | badge.textStyles.lineHeight | `16px` | `24px` | 8.0px (16px -> 24px) | **Major** |
| platform-advantages | badge | badge.boxStyles.width | `174.3px` | `176px` | 1.7px (174.3px -> 176px) | **Minor** |
| platform-advantages | badge | badge.boxStyles.border | `1px solid rgb(176, 194, 232)` | `1px solid rgba(0, 17, 46, 0.15)` | 1px solid rgb(176, 194, 232) vs 1px solid rgba(0, 17, 46, 0.15) | **Minor** |
| platform-advantages | badge | badge.boxStyles.borderRadius | `3.35544e+07px` | `9999px` | 33544401.0px (3.35544e+07px -> 9999px) | **Minor** |
| platform-advantages | badge | badge.boxStyles.backgroundColor | `rgb(217, 226, 245)` | `rgb(224, 231, 255)` | rgb(217, 226, 245) vs rgb(224, 231, 255) | **Major** |
| platform-advantages | badge | badge.boxStyles.boxShadow | `rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.05) 0px 1px 2px 0px` | `rgba(0, 0, 0, 0.05) 0px 1px 2px 0px` | rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.05) 0px 1px 2px 0px vs rgba(0, 0, 0, 0.05) 0px 1px 2px 0px | **Minor** |
| platform-advantages | badge | badge.layout.display | `inline-flex` | `flex` | inline-flex vs flex | **Minor** |
| platform-advantages | badge | badge.layout.position | `static` | `relative` | static vs relative | **Minor** |
| platform-advantages | badge | badge.layout.zIndex | `auto` | `0` | auto vs 0 | **Minor** |
| platform-advantages | badge | badge.layout.boundingRect.x | `108` | `107` | 108 vs 107 | **Minor** |
| platform-advantages | badge | badge.layout.boundingRect.y | `-7126` | `3055` | -7126 vs 3055 | **Minor** |
| platform-advantages | badge | badge.layout.boundingRect.width | `174` | `176` | 174 vs 176 | **Minor** |
| platform-advantages | badge | badge.animation.name | `none` | `NOT MEASURED` | none vs NOT MEASURED | **Minor** |
| platform-advantages | badge | badge.animation.duration | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| platform-advantages | badge | badge.animation.timingFunction | `ease` | `NOT MEASURED` | ease vs NOT MEASURED | **Minor** |
| platform-advantages | badge | badge.animation.delay | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| platform-advantages | heading | heading.tag | `H2` | `DIV` | H2 vs DIV | **Minor** |
| platform-advantages | heading | heading.textStyles.fontFamily | `"Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | `"Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | "Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif vs "Plus Jakarta Sans", system-ui, -apple-system, sans-serif | **Minor** |
| platform-advantages | heading | heading.boxStyles.border | `0px solid rgb(0, 17, 46)` | `0px solid rgb(0, 0, 0)` | 0px solid rgb(0, 17, 46) vs 0px solid rgb(0, 0, 0) | **Minor** |
| platform-advantages | heading | heading.layout.position | `static` | `relative` | static vs relative | **Minor** |
| platform-advantages | heading | heading.layout.boundingRect.y | `-7084` | `3097` | -7084 vs 3097 | **Minor** |
| platform-advantages | heading | heading.animation.name | `none` | `NOT MEASURED` | none vs NOT MEASURED | **Minor** |
| platform-advantages | heading | heading.animation.duration | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| platform-advantages | heading | heading.animation.timingFunction | `ease` | `NOT MEASURED` | ease vs NOT MEASURED | **Minor** |
| platform-advantages | heading | heading.animation.delay | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| trades | section | section.tag | `SECTION` | `DIV` | SECTION vs DIV | **Minor** |
| trades | section | section.textStyles.fontFamily | `"Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | `"Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` | "Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif vs "Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif | **Minor** |
| trades | section | section.textStyles.textAlign | `start` | `center` | start vs center | **Minor** |
| trades | section | section.textStyles.color | `rgb(0, 17, 46)` | `rgb(169, 73, 0)` | rgb(0, 17, 46) vs rgb(169, 73, 0) | **Major** |
| trades | section | section.boxStyles.width | `390px` | `174.1px` | 215.9px (390px -> 174.1px) | **Major** |
| trades | section | section.boxStyles.height | `3067.5px` | `26px` | 3041.5px (3067.5px -> 26px) | **Major** |
| trades | section | section.boxStyles.padding | `96px 16px 96px 16px` | `4px 14px 4px 14px` | 92.0px (96px 16px 96px 16px -> 4px 14px 4px 14px) | **Minor** |
| trades | section | section.boxStyles.gap | `normal` | `6px` | normal vs 6px | **Minor** |
| trades | section | section.boxStyles.border | `1px solid rgb(231, 226, 218)` | `1px solid rgb(255, 196, 160)` | 1px solid rgb(231, 226, 218) vs 1px solid rgb(255, 196, 160) | **Minor** |
| trades | section | section.boxStyles.borderRadius | `0px` | `9999px` | 9999.0px (0px -> 9999px) | **Minor** |
| trades | section | section.boxStyles.backgroundColor | `rgb(255, 255, 255)` | `rgb(255, 244, 236)` | rgb(255, 255, 255) vs rgb(255, 244, 236) | **Major** |
| trades | section | section.boxStyles.boxShadow | `none` | `rgba(0, 0, 0, 0.05) 0px 1px 2px 0px` | none vs rgba(0, 0, 0, 0.05) 0px 1px 2px 0px | **Minor** |
| trades | section | section.layout.display | `block` | `flex` | block vs flex | **Minor** |
| trades | section | section.layout.alignItems | `normal` | `center` | normal vs center | **Minor** |
| trades | section | section.layout.position | `static` | `relative` | static vs relative | **Minor** |
| trades | section | section.layout.zIndex | `auto` | `0` | auto vs 0 | **Minor** |
| trades | section | section.layout.boundingRect.x | `0` | `108` | 0 vs 108 | **Minor** |
| trades | section | section.layout.boundingRect.y | `-5573` | `4436` | -5573 vs 4436 | **Minor** |
| trades | section | section.layout.boundingRect.width | `390` | `174` | 390 vs 174 | **Minor** |
| trades | section | section.layout.boundingRect.height | `3068` | `26` | 3068 vs 26 | **Minor** |
| trades | section | section.animation.name | `none` | `NOT MEASURED` | none vs NOT MEASURED | **Minor** |
| trades | section | section.animation.duration | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| trades | section | section.animation.timingFunction | `ease` | `NOT MEASURED` | ease vs NOT MEASURED | **Minor** |
| trades | section | section.animation.delay | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| trades | badge | badge.tag | `SPAN` | `DIV` | SPAN vs DIV | **Minor** |
| trades | badge | badge.textStyles.fontFamily | `"Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | `"Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` | "Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif vs "Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif | **Minor** |
| trades | badge | badge.textStyles.fontSize | `12px` | `16px` | 4.0px (12px -> 16px) | **Major** |
| trades | badge | badge.textStyles.fontWeight | `800` | `400` | 800 vs 400 | **Minor** |
| trades | badge | badge.textStyles.lineHeight | `16px` | `24px` | 8.0px (16px -> 24px) | **Major** |
| trades | badge | badge.boxStyles.width | `169.9px` | `174.1px` | 4.2px (169.9px -> 174.1px) | **Minor** |
| trades | badge | badge.boxStyles.borderRadius | `3.35544e+07px` | `9999px` | 33544401.0px (3.35544e+07px -> 9999px) | **Minor** |
| trades | badge | badge.boxStyles.boxShadow | `rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.05) 0px 1px 2px 0px` | `rgba(0, 0, 0, 0.05) 0px 1px 2px 0px` | rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.05) 0px 1px 2px 0px vs rgba(0, 0, 0, 0.05) 0px 1px 2px 0px | **Minor** |
| trades | badge | badge.layout.display | `inline-flex` | `flex` | inline-flex vs flex | **Minor** |
| trades | badge | badge.layout.position | `static` | `relative` | static vs relative | **Minor** |
| trades | badge | badge.layout.zIndex | `auto` | `0` | auto vs 0 | **Minor** |
| trades | badge | badge.layout.boundingRect.x | `110` | `108` | 110 vs 108 | **Minor** |
| trades | badge | badge.layout.boundingRect.y | `-5476` | `4436` | -5476 vs 4436 | **Minor** |
| trades | badge | badge.layout.boundingRect.width | `170` | `174` | 170 vs 174 | **Minor** |
| trades | badge | badge.animation.name | `none` | `NOT MEASURED` | none vs NOT MEASURED | **Minor** |
| trades | badge | badge.animation.duration | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| trades | badge | badge.animation.timingFunction | `ease` | `NOT MEASURED` | ease vs NOT MEASURED | **Minor** |
| trades | badge | badge.animation.delay | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| trades | heading | heading.tag | `H2` | `DIV` | H2 vs DIV | **Minor** |
| trades | heading | heading.textStyles.fontFamily | `"Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | `"Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | "Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif vs "Plus Jakarta Sans", system-ui, -apple-system, sans-serif | **Minor** |
| trades | heading | heading.boxStyles.border | `0px solid rgb(0, 17, 46)` | `0px solid rgb(0, 0, 0)` | 0px solid rgb(0, 17, 46) vs 0px solid rgb(0, 0, 0) | **Minor** |
| trades | heading | heading.layout.position | `static` | `relative` | static vs relative | **Minor** |
| trades | heading | heading.layout.boundingRect.y | `-5434` | `4478` | -5434 vs 4478 | **Minor** |
| trades | heading | heading.animation.name | `none` | `NOT MEASURED` | none vs NOT MEASURED | **Minor** |
| trades | heading | heading.animation.duration | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| trades | heading | heading.animation.timingFunction | `ease` | `NOT MEASURED` | ease vs NOT MEASURED | **Minor** |
| trades | heading | heading.animation.delay | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| testimonials | section | section.tag | `SECTION` | `DIV` | SECTION vs DIV | **Minor** |
| testimonials | section | section.textStyles.fontFamily | `"Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | `"Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` | "Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif vs "Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif | **Minor** |
| testimonials | section | section.textStyles.textAlign | `start` | `center` | start vs center | **Minor** |
| testimonials | section | section.textStyles.color | `rgb(0, 17, 46)` | `rgb(6, 95, 70)` | rgb(0, 17, 46) vs rgb(6, 95, 70) | **Major** |
| testimonials | section | section.boxStyles.width | `390px` | `189.3px` | 200.7px (390px -> 189.3px) | **Major** |
| testimonials | section | section.boxStyles.height | `828px` | `26px` | 802.0px (828px -> 26px) | **Major** |
| testimonials | section | section.boxStyles.padding | `96px 16px 96px 16px` | `4px 14px 4px 14px` | 92.0px (96px 16px 96px 16px -> 4px 14px 4px 14px) | **Minor** |
| testimonials | section | section.boxStyles.gap | `normal` | `6px` | normal vs 6px | **Minor** |
| testimonials | section | section.boxStyles.border | `1px solid rgb(231, 226, 218)` | `1px solid rgb(167, 243, 208)` | 1px solid rgb(231, 226, 218) vs 1px solid rgb(167, 243, 208) | **Minor** |
| testimonials | section | section.boxStyles.borderRadius | `0px` | `9999px` | 9999.0px (0px -> 9999px) | **Minor** |
| testimonials | section | section.boxStyles.backgroundColor | `oklab(0.959068 0.00123698 0.00732243 / 0.4)` | `rgb(236, 253, 245)` | oklab(0.959068 0.00123698 0.00732243 / 0.4) vs rgb(236, 253, 245) | **Major** |
| testimonials | section | section.boxStyles.boxShadow | `none` | `rgba(0, 0, 0, 0.05) 0px 1px 2px 0px` | none vs rgba(0, 0, 0, 0.05) 0px 1px 2px 0px | **Minor** |
| testimonials | section | section.boxStyles.overflow | `hidden` | `visible` | hidden vs visible | **Minor** |
| testimonials | section | section.layout.display | `block` | `flex` | block vs flex | **Minor** |
| testimonials | section | section.layout.alignItems | `normal` | `center` | normal vs center | **Minor** |
| testimonials | section | section.layout.zIndex | `auto` | `0` | auto vs 0 | **Minor** |
| testimonials | section | section.layout.boundingRect.x | `0` | `100` | 0 vs 100 | **Minor** |
| testimonials | section | section.layout.boundingRect.y | `-2505` | `6449` | -2505 vs 6449 | **Minor** |
| testimonials | section | section.layout.boundingRect.width | `390` | `189` | 390 vs 189 | **Minor** |
| testimonials | section | section.layout.boundingRect.height | `828` | `26` | 828 vs 26 | **Minor** |
| testimonials | section | section.animation.name | `none` | `NOT MEASURED` | none vs NOT MEASURED | **Minor** |
| testimonials | section | section.animation.duration | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| testimonials | section | section.animation.timingFunction | `ease` | `NOT MEASURED` | ease vs NOT MEASURED | **Minor** |
| testimonials | section | section.animation.delay | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| testimonials | badge | badge.tag | `SPAN` | `DIV` | SPAN vs DIV | **Minor** |
| testimonials | badge | badge.textStyles.fontFamily | `"Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | `"Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` | "Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif vs "Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif | **Minor** |
| testimonials | badge | badge.textStyles.fontSize | `12px` | `16px` | 4.0px (12px -> 16px) | **Major** |
| testimonials | badge | badge.textStyles.fontWeight | `800` | `400` | 800 vs 400 | **Minor** |
| testimonials | badge | badge.textStyles.lineHeight | `16px` | `24px` | 8.0px (16px -> 24px) | **Major** |
| testimonials | badge | badge.textStyles.color | `lab(35.3675 -33.1188 8.04002)` | `rgb(6, 95, 70)` | lab(35.3675 -33.1188 8.04002) vs rgb(6, 95, 70) | **Major** |
| testimonials | badge | badge.boxStyles.width | `185.8px` | `189.3px` | 3.5px (185.8px -> 189.3px) | **Minor** |
| testimonials | badge | badge.boxStyles.border | `1px solid lab(90.2247 -31.039 9.47084)` | `1px solid rgb(167, 243, 208)` | 1px solid lab(90.2247 -31.039 9.47084) vs 1px solid rgb(167, 243, 208) | **Minor** |
| testimonials | badge | badge.boxStyles.borderRadius | `3.35544e+07px` | `9999px` | 33544401.0px (3.35544e+07px -> 9999px) | **Minor** |
| testimonials | badge | badge.boxStyles.backgroundColor | `lab(97.8462 -6.94963 1.85487)` | `rgb(236, 253, 245)` | lab(97.8462 -6.94963 1.85487) vs rgb(236, 253, 245) | **Major** |
| testimonials | badge | badge.boxStyles.boxShadow | `rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.05) 0px 1px 2px 0px` | `rgba(0, 0, 0, 0.05) 0px 1px 2px 0px` | rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.05) 0px 1px 2px 0px vs rgba(0, 0, 0, 0.05) 0px 1px 2px 0px | **Minor** |
| testimonials | badge | badge.layout.display | `inline-flex` | `flex` | inline-flex vs flex | **Minor** |
| testimonials | badge | badge.layout.position | `static` | `relative` | static vs relative | **Minor** |
| testimonials | badge | badge.layout.zIndex | `auto` | `0` | auto vs 0 | **Minor** |
| testimonials | badge | badge.layout.boundingRect.x | `102` | `100` | 102 vs 100 | **Minor** |
| testimonials | badge | badge.layout.boundingRect.y | `-2408` | `6449` | -2408 vs 6449 | **Minor** |
| testimonials | badge | badge.layout.boundingRect.width | `186` | `189` | 186 vs 189 | **Minor** |
| testimonials | badge | badge.animation.name | `none` | `NOT MEASURED` | none vs NOT MEASURED | **Minor** |
| testimonials | badge | badge.animation.duration | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| testimonials | badge | badge.animation.timingFunction | `ease` | `NOT MEASURED` | ease vs NOT MEASURED | **Minor** |
| testimonials | badge | badge.animation.delay | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| testimonials | heading | heading.tag | `H2` | `DIV` | H2 vs DIV | **Minor** |
| testimonials | heading | heading.textStyles.fontFamily | `"Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | `"Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | "Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif vs "Plus Jakarta Sans", system-ui, -apple-system, sans-serif | **Minor** |
| testimonials | heading | heading.boxStyles.border | `0px solid rgb(0, 17, 46)` | `0px solid rgb(0, 0, 0)` | 0px solid rgb(0, 17, 46) vs 0px solid rgb(0, 0, 0) | **Minor** |
| testimonials | heading | heading.layout.position | `static` | `relative` | static vs relative | **Minor** |
| testimonials | heading | heading.layout.boundingRect.y | `-2366` | `6491` | -2366 vs 6491 | **Minor** |
| testimonials | heading | heading.animation.name | `none` | `NOT MEASURED` | none vs NOT MEASURED | **Minor** |
| testimonials | heading | heading.animation.duration | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| testimonials | heading | heading.animation.timingFunction | `ease` | `NOT MEASURED` | ease vs NOT MEASURED | **Minor** |
| testimonials | heading | heading.animation.delay | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| faq | section | section.tag | `SECTION` | `DIV` | SECTION vs DIV | **Minor** |
| faq | section | section.textStyles.fontFamily | `"Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | `"Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` | "Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif vs "Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif | **Minor** |
| faq | section | section.textStyles.textAlign | `start` | `center` | start vs center | **Minor** |
| faq | section | section.boxStyles.width | `390px` | `118.6px` | 271.4px (390px -> 118.6px) | **Major** |
| faq | section | section.boxStyles.height | `1047px` | `26px` | 1021.0px (1047px -> 26px) | **Major** |
| faq | section | section.boxStyles.padding | `96px 16px 96px 16px` | `4px 14px 4px 14px` | 92.0px (96px 16px 96px 16px -> 4px 14px 4px 14px) | **Minor** |
| faq | section | section.boxStyles.gap | `normal` | `6px` | normal vs 6px | **Minor** |
| faq | section | section.boxStyles.border | `1px solid rgb(231, 226, 218)` | `1px solid rgba(0, 17, 46, 0.15)` | 1px solid rgb(231, 226, 218) vs 1px solid rgba(0, 17, 46, 0.15) | **Minor** |
| faq | section | section.boxStyles.borderRadius | `0px` | `9999px` | 9999.0px (0px -> 9999px) | **Minor** |
| faq | section | section.boxStyles.backgroundColor | `rgb(255, 255, 255)` | `rgba(0, 17, 46, 0.05)` | rgb(255, 255, 255) vs rgba(0, 17, 46, 0.05) | **Major** |
| faq | section | section.layout.display | `block` | `flex` | block vs flex | **Minor** |
| faq | section | section.layout.alignItems | `normal` | `center` | normal vs center | **Minor** |
| faq | section | section.layout.justifyContent | `normal` | `center` | normal vs center | **Minor** |
| faq | section | section.layout.position | `static` | `relative` | static vs relative | **Minor** |
| faq | section | section.layout.zIndex | `auto` | `0` | auto vs 0 | **Minor** |
| faq | section | section.layout.boundingRect.x | `0` | `136` | 0 vs 136 | **Minor** |
| faq | section | section.layout.boundingRect.y | `-1677` | `7157` | -1677 vs 7157 | **Minor** |
| faq | section | section.layout.boundingRect.width | `390` | `119` | 390 vs 119 | **Minor** |
| faq | section | section.layout.boundingRect.height | `1047` | `26` | 1047 vs 26 | **Minor** |
| faq | section | section.animation.name | `none` | `NOT MEASURED` | none vs NOT MEASURED | **Minor** |
| faq | section | section.animation.duration | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| faq | section | section.animation.timingFunction | `ease` | `NOT MEASURED` | ease vs NOT MEASURED | **Minor** |
| faq | section | section.animation.delay | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| faq | badge | badge.tag | `SPAN` | `DIV` | SPAN vs DIV | **Minor** |
| faq | badge | badge.text | `Got Questions?` | `NOT MEASURED` | Got Questions? vs NOT MEASURED | **Minor** |
| faq | badge | badge.textStyles.fontFamily | `"Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | `"Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` | "Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif vs "Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif | **Minor** |
| faq | badge | badge.textStyles.fontSize | `12px` | `16px` | 4.0px (12px -> 16px) | **Major** |
| faq | badge | badge.textStyles.fontWeight | `800` | `400` | 800 vs 400 | **Minor** |
| faq | badge | badge.textStyles.lineHeight | `16px` | `24px` | 8.0px (16px -> 24px) | **Major** |
| faq | badge | badge.boxStyles.width | `122.5px` | `118.6px` | 3.9px (122.5px -> 118.6px) | **Minor** |
| faq | badge | badge.boxStyles.border | `1px solid rgb(176, 194, 232)` | `1px solid rgba(0, 17, 46, 0.15)` | 1px solid rgb(176, 194, 232) vs 1px solid rgba(0, 17, 46, 0.15) | **Minor** |
| faq | badge | badge.boxStyles.borderRadius | `3.35544e+07px` | `9999px` | 33544401.0px (3.35544e+07px -> 9999px) | **Minor** |
| faq | badge | badge.boxStyles.backgroundColor | `rgb(238, 242, 251)` | `rgba(0, 17, 46, 0.05)` | rgb(238, 242, 251) vs rgba(0, 17, 46, 0.05) | **Major** |
| faq | badge | badge.layout.display | `inline-flex` | `flex` | inline-flex vs flex | **Minor** |
| faq | badge | badge.layout.justifyContent | `normal` | `center` | normal vs center | **Minor** |
| faq | badge | badge.layout.position | `static` | `relative` | static vs relative | **Minor** |
| faq | badge | badge.layout.zIndex | `auto` | `0` | auto vs 0 | **Minor** |
| faq | badge | badge.layout.boundingRect.x | `134` | `136` | 134 vs 136 | **Minor** |
| faq | badge | badge.layout.boundingRect.y | `-1579` | `7157` | -1579 vs 7157 | **Minor** |
| faq | badge | badge.layout.boundingRect.width | `122` | `119` | 122 vs 119 | **Minor** |
| faq | badge | badge.animation.name | `none` | `NOT MEASURED` | none vs NOT MEASURED | **Minor** |
| faq | badge | badge.animation.duration | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| faq | badge | badge.animation.timingFunction | `ease` | `NOT MEASURED` | ease vs NOT MEASURED | **Minor** |
| faq | badge | badge.animation.delay | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| faq | heading | heading.tag | `H2` | `DIV` | H2 vs DIV | **Minor** |
| faq | heading | heading.textStyles.fontFamily | `"Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | `"Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | "Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif vs "Plus Jakarta Sans", system-ui, -apple-system, sans-serif | **Minor** |
| faq | heading | heading.boxStyles.border | `0px solid rgb(0, 17, 46)` | `0px solid rgb(0, 0, 0)` | 0px solid rgb(0, 17, 46) vs 0px solid rgb(0, 0, 0) | **Minor** |
| faq | heading | heading.layout.position | `static` | `relative` | static vs relative | **Minor** |
| faq | heading | heading.layout.boundingRect.y | `-1537` | `7199` | -1537 vs 7199 | **Minor** |
| faq | heading | heading.animation.name | `none` | `NOT MEASURED` | none vs NOT MEASURED | **Minor** |
| faq | heading | heading.animation.duration | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| faq | heading | heading.animation.timingFunction | `ease` | `NOT MEASURED` | ease vs NOT MEASURED | **Minor** |
| faq | heading | heading.animation.delay | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| final-cta | badge | badge.tag | `SPAN` | `DIV` | SPAN vs DIV | **Minor** |
| final-cta | badge | badge.textStyles.fontFamily | `"Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | `"Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` | "Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif vs "Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif | **Minor** |
| final-cta | badge | badge.textStyles.fontSize | `12px` | `16px` | 4.0px (12px -> 16px) | **Major** |
| final-cta | badge | badge.textStyles.fontWeight | `800` | `400` | 800 vs 400 | **Minor** |
| final-cta | badge | badge.textStyles.lineHeight | `16px` | `24px` | 8.0px (16px -> 24px) | **Major** |
| final-cta | badge | badge.textStyles.textAlign | `center` | `start` | center vs start | **Minor** |
| final-cta | badge | badge.textStyles.color | `lab(86.4156 6.13147 78.3961)` | `rgb(252, 211, 77)` | lab(86.4156 6.13147 78.3961) vs rgb(252, 211, 77) | **Major** |
| final-cta | badge | badge.boxStyles.width | `187px` | `191.6px` | 4.6px (187px -> 191.6px) | **Minor** |
| final-cta | badge | badge.boxStyles.border | `1px solid oklab(0.698677 0.127265 0.14141 / 0.3)` | `1px solid rgba(248, 112, 0, 0.3)` | 1px solid oklab(0.698677 0.127265 0.14141 / 0.3) vs 1px solid rgba(248, 112, 0, 0.3) | **Minor** |
| final-cta | badge | badge.boxStyles.borderRadius | `3.35544e+07px` | `9999px` | 33544401.0px (3.35544e+07px -> 9999px) | **Minor** |
| final-cta | badge | badge.boxStyles.backgroundColor | `oklab(0.698677 0.127265 0.14141 / 0.2)` | `rgba(248, 112, 0, 0.2)` | oklab(0.698677 0.127265 0.14141 / 0.2) vs rgba(248, 112, 0, 0.2) | **Major** |
| final-cta | badge | badge.layout.display | `inline-flex` | `flex` | inline-flex vs flex | **Minor** |
| final-cta | badge | badge.layout.position | `static` | `relative` | static vs relative | **Minor** |
| final-cta | badge | badge.layout.zIndex | `auto` | `0` | auto vs 0 | **Minor** |
| final-cta | badge | badge.layout.boundingRect.x | `101` | `99` | 101 vs 99 | **Minor** |
| final-cta | badge | badge.layout.boundingRect.y | `-565` | `8024` | -565 vs 8024 | **Minor** |
| final-cta | badge | badge.layout.boundingRect.width | `187` | `192` | 187 vs 192 | **Minor** |
| final-cta | badge | badge.animation.name | `none` | `NOT MEASURED` | none vs NOT MEASURED | **Minor** |
| final-cta | badge | badge.animation.duration | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| final-cta | badge | badge.animation.timingFunction | `ease` | `NOT MEASURED` | ease vs NOT MEASURED | **Minor** |
| final-cta | badge | badge.animation.delay | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| final-cta | heading | heading.tag | `H2` | `DIV` | H2 vs DIV | **Minor** |
| final-cta | heading | heading.textStyles.fontFamily | `"Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | `"Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | "Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif vs "Plus Jakarta Sans", system-ui, -apple-system, sans-serif | **Minor** |
| final-cta | heading | heading.boxStyles.border | `0px solid rgb(255, 255, 255)` | `0px solid rgb(0, 0, 0)` | 0px solid rgb(255, 255, 255) vs 0px solid rgb(0, 0, 0) | **Minor** |
| final-cta | heading | heading.layout.position | `static` | `relative` | static vs relative | **Minor** |
| final-cta | heading | heading.layout.boundingRect.y | `-519` | `8070` | -519 vs 8070 | **Minor** |
| final-cta | heading | heading.animation.name | `none` | `NOT MEASURED` | none vs NOT MEASURED | **Minor** |
| final-cta | heading | heading.animation.duration | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| final-cta | heading | heading.animation.timingFunction | `ease` | `NOT MEASURED` | ease vs NOT MEASURED | **Minor** |
| final-cta | heading | heading.animation.delay | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| footer | container | container.tag | `FOOTER` | `DIV` | FOOTER vs DIV | **Minor** |
| footer | container | container.textStyles.fontFamily | `"Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif` | `"Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` | "Plus Jakarta Sans", "Plus Jakarta Sans Fallback", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif vs "Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif | **Minor** |
| footer | container | container.textStyles.color | `lab(84.7652 -1.94535 -7.93337)` | `rgb(203, 213, 225)` | lab(84.7652 -1.94535 -7.93337) vs rgb(203, 213, 225) | **Major** |
| footer | container | container.boxStyles.height | `1070px` | `1080.5px` | 10.5px (1070px -> 1080.5px) | **Minor** |
| footer | container | container.boxStyles.border | `1px solid rgb(0, 26, 78)` | `1px solid rgba(30, 41, 59, 0.8)` | 1px solid rgb(0, 26, 78) vs 1px solid rgba(30, 41, 59, 0.8) | **Minor** |
| footer | container | container.layout.display | `block` | `flex` | block vs flex | **Minor** |
| footer | container | container.layout.flexDirection | `row` | `column` | row vs column | **Minor** |
| footer | container | container.layout.alignItems | `normal` | `stretch` | normal vs stretch | **Minor** |
| footer | container | container.layout.zIndex | `auto` | `0` | auto vs 0 | **Minor** |
| footer | container | container.layout.boundingRect.y | `-1` | `8557` | -1 vs 8557 | **Minor** |
| footer | container | container.layout.boundingRect.height | `1070` | `1081` | 1070 vs 1081 | **Minor** |
| footer | container | container.animation.name | `none` | `NOT MEASURED` | none vs NOT MEASURED | **Minor** |
| footer | container | container.animation.duration | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
| footer | container | container.animation.timingFunction | `ease` | `NOT MEASURED` | ease vs NOT MEASURED | **Minor** |
| footer | container | container.animation.delay | `0s` | `NOT MEASURED` | 0s vs NOT MEASURED | **Minor** |
