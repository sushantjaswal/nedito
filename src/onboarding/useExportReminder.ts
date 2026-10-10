import { useEffect } from "react";
import { useDocStore } from "../model/store";

// Counts mutating actions for the export reminder by watching `doc` identity, the same trick
// useDemoDiagram uses to notice the sample being edited: the store's command pattern means
// every named action replaces `doc` with a new object, so one subscription here covers all
// sixty-odd of them and can't drift out of date when a new action is added.
//
// `docEpoch` is what separates an edit from a document swap — File > Open, File > New, restoring
// an autosave and loading the sample all replace `doc` too, and none of them is a change the
// user has yet to save.
export function useExportReminder(): void {
  useEffect(
    () =>
      useDocStore.subscribe((state, prev) => {
        if (state.doc === prev.doc || state.docEpoch !== prev.docEpoch) return;
        state.noteDocumentMutation();
      }),
    [],
  );
}
