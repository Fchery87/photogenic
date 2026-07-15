import React from "react";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    document.dispatchEvent(
      new CustomEvent("photogenic:crash", {
        detail: {
          message: error.message,
          stack: error.stack ?? String(error),
          componentStack: errorInfo.componentStack ?? null,
        },
      }),
    );
  }

  render() {
    if (this.state.hasError) {
      return React.createElement(
        "div",
        { className: "error-boundary", role: "alert" },
        React.createElement("h2", null, "Something went wrong"),
        React.createElement(
          "p",
          { className: "error-boundary__message" },
          this.state.error?.message ?? "An unexpected error occurred.",
        ),
        React.createElement(
          "button",
          {
            className: "btn",
            onClick: () => location.reload(),
          },
          "Reload",
        ),
      );
    }

    return this.props.children;
  }
}
