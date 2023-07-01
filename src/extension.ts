import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  let lastPosition: { uri: vscode.Uri; position: vscode.Position } | null =
    null;

  const getMarkersSorted = (diagnostics: vscode.Diagnostic[]) =>
    diagnostics.sort((a, b) =>
      a.range.start.isBefore(b.range.start)
        ? -1
        : a.range.start.isEqual(b.range.start)
        ? 0
        : 1
    );

  const getCloserPrev = (
    editor: vscode.TextEditor,
    currentMarker: vscode.Diagnostic,
    soFarClosest: vscode.Diagnostic | null
  ) => {
    if (
      currentMarker.range.start.isBeforeOrEqual(editor.selection.start) && // Select only errors before the cursor.
      (soFarClosest === null ||
        currentMarker.range.start.isAfter(soFarClosest.range.start)) // Select the error closest to the cursor.
    ) {
      return currentMarker;
    }
    return soFarClosest;
  };

  const getCloserNext = (
    editor: vscode.TextEditor,
    currentMarker: vscode.Diagnostic,
    soFarClosest: vscode.Diagnostic | null
  ) => {
    if (
      currentMarker.range.start.isAfterOrEqual(editor.selection.start) && // Select only errors before the cursor.
      (soFarClosest === null ||
        currentMarker.range.start.isBefore(soFarClosest.range.start)) // Select the error closest to the cursor.
    ) {
      return currentMarker;
    }
    return soFarClosest;
  };

  /**
   * Selects the next error in the active file.
   * Returns false if loop = false and there are no errors after the cursor.
   */
  const gotoMarkerInFile = async (
    filter: vscode.DiagnosticSeverity[],
    direction: "next" | "prev",
    loop = true
  ) => {
    const editor = vscode.window.activeTextEditor;
    if (editor === undefined) {
      return false;
    }
    const diagnostics = vscode.languages
      .getDiagnostics(editor.document.uri)
      .filter((d) => filter.includes(d.severity));

    if (lastPosition?.uri.toString() !== editor.document.uri.toString()) {
      lastPosition = null;
    }
    let next: vscode.Diagnostic | null = null;
    if (diagnostics.length === 0) {
      return false;
    }

    for (const d of diagnostics) {
      if (lastPosition && d.range.start.isEqual(lastPosition.position)) {
        continue;
      }

      next =
        direction === "next"
          ? getCloserNext(editor, d, next)
          : getCloserPrev(editor, d, next);
    }

    if (next === null && loop) {
      const sortedMarkers = getMarkersSorted(diagnostics);
      next =
        direction === "next"
          ? sortedMarkers[0]
          : sortedMarkers[sortedMarkers.length - 1];

      // Fix: When there is only one error location in the file, multiple command calls will select a non-error marker.
      if (
        lastPosition !== null &&
        lastPosition.position.isEqual(next.range.start) &&
        editor.selection.start.isEqual(next.range.start)
      ) {
        return true;
      }
    }

    if (next === null) {
      return false;
    }

    lastPosition = { position: next.range.start, uri: editor.document.uri };
    editor.selection = new vscode.Selection(next.range.start, next.range.start);
    vscode.commands.executeCommand("closeMarkersNavigation"); // Issue #3
    vscode.commands.executeCommand(
      "editor.action.goToLocations",
      lastPosition.uri,
      [lastPosition.position]
    );
    vscode.commands.executeCommand("editor.action.showHover");
    return true;
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("goto-error-hover.next", () =>
      gotoMarkerInFile(
        [vscode.DiagnosticSeverity.Error, vscode.DiagnosticSeverity.Warning],
        "next"
      )
    ),
    vscode.commands.registerCommand("goto-error-hover.prev", () =>
      gotoMarkerInFile(
        [vscode.DiagnosticSeverity.Error, vscode.DiagnosticSeverity.Warning],
        "prev"
      )
    )
  );
}

export function deactivate() {}
