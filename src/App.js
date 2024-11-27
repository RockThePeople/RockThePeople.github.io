import Coworking from "./coworking";
import Frontend from "./frontend";
import { BrowserRouter, Route, Routes } from "react-router-dom";
// import ManualMining from "./manualMining/manualMining";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path={"/"} element={<Coworking />}></Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;