import { createBrowserRouter } from "react-router"; // ← Fixed import
import App from "../App";
import Main from "../components/Main";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: App,
    children: [
      {
        index: true,
        Component: Main,
      },
    ],
  },
]);
