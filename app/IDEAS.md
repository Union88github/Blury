# Ideas

Parked, not built. Nothing here is in v1 scope.

- **Per-pixel click-through.** Built — the cursor poll in `start_hit_testing`
  now makes the window click-through outside a 40px radius of the bubble. What
  is still approximate is the *shape*: the hit area is a circle around the
  centre, so while the arc is open the whole 360×360 window is live rather than
  just the discs. That is deliberate (the empty area dismisses the menu), but a
  future version could test against the actual item positions and let clicks
  between the arc's spokes fall through to the app behind.
- **Edge tuck.** After a few idle seconds against an edge, slide most of the way
  off-screen like a scrollbar; nudge the cursor at the edge to bring it back.
- **Arc item hover preview.** Show the tool's label as a small caption at the
  bubble's centre while an arc item is hovered, instead of a tooltip.
- **Notes: multiple notes.** v1 is one plain-text buffer. Tabs or a list would
  need real storage design.
- **Screenshot: window capture mode.** Hold a modifier during selection to snap
  the rectangle to the window under the cursor.
