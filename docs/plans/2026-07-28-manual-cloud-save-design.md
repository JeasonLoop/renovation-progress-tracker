# Manual Cloud Save Design

Add a cloud-upload icon button beside the existing sync status in the top-right toolbar. It immediately cancels a pending autosave debounce and queues the current project snapshot for D1 persistence. It uses the same optimistic revision check as autosave, so a conflict opens the existing resolution dialog rather than overwriting another device.

The button is disabled while initial cloud state is loading or while its own request is pending. Automatic synchronization remains enabled. Desktop and mobile use the existing stable 38 px icon-button control with an accessible label and tooltip.
