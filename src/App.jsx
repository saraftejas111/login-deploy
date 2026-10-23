import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./Login";
import Signup from "./Signup";
import ForgotPassword from "./ForgotPassword";
import UpdatePassword from "./UpdatePassword";
import ProtectedRoute from "./ProtectedRoute";
import SocialLayout from "./SocialLayout";
import Dashboard from "./Dashboard";
import ProfilePage from "./ProfilePage";
import PeoplePage from "./PeoplePage";
import FriendsPage from "./FriendsPage";
import MessagesPage from "./MessagesPage";

const App = () => (
  <Routes>
    <Route path="/" element={<Login />} />
    <Route path="/signup" element={<Signup />} />
    <Route path="/forgot" element={<ForgotPassword />} />
    <Route path="/update-password" element={<UpdatePassword />} />
    <Route element={<ProtectedRoute />}>
      <Route element={<SocialLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/:userId" element={<ProfilePage />} />
        <Route path="/people" element={<PeoplePage />} />
        <Route path="/friends" element={<FriendsPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/messages/:userId" element={<MessagesPage />} />
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes>
);

export default App;
