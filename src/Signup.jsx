
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";

const Signup = () => {
  const [form, setForm] = useState({
    firstname: "",
    lastname: "",
    email: "",
    mobile: "",
    username: "",
    password: "",
    securityquestion: "What is Your Pet Name?",
    securityanswer: "",
  });

  const [imageFile, setImageFile] = useState(null);
  const [preview, setPreview] = useState("");

  const navigateMe = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please select an image file.");
      e.target.value = "";
      return;
    }

    if (file.size > 1024 * 1024) {
      alert("Please select an image smaller than 1 MB.");
      e.target.value = "";
      return;
    }

    setImageFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      // 1. Register the account
      const { data, error } = await supabase.auth.signUp({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        options: {
          data: {
            firstname: form.firstname,
            lastname: form.lastname,
            mobile: form.mobile,
            username: form.username,
          },
        },
      });

      if (error) throw error;

      const user = data.user;

      if (!user) {
        throw new Error("Account creation failed.");
      }

      let profileSaveFailed = false;

      // Keep the profile lookup used by username/mobile login in sync with Auth.
      // With email confirmation enabled, this write must instead be done by a
      // database trigger because Supabase returns no authenticated session yet.
      if (data.session) {
        const { error: profileError } = await supabase.from("profiles").upsert({
          id: user.id,
          firstname: form.firstname.trim(),
          lastname: form.lastname.trim(),
          email: form.email.trim().toLowerCase(),
          mobile: form.mobile.trim(),
          username: form.username.trim(),
          securityquestion: form.securityquestion,
          securityanswer: form.securityanswer.trim(),
        });

        if (profileError) {
          profileSaveFailed = true;
          console.error("Profile creation error:", profileError.message);
        }
      }

      // 2. Upload the image when a session is available
      if (imageFile && data.session) {
        const filePath =
          `${user.id}/${Date.now()}-${imageFile.name}`;

        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(filePath, imageFile, {
            contentType: imageFile.type,
            upsert: false,
          });

        if (uploadError) throw uploadError;

        // 3. Get the public image URL
        const { data: imageData } = supabase.storage
          .from("avatars")
          .getPublicUrl(filePath);

        // 4. Save the image URL in the profile
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ propic: imageData.publicUrl })
          .eq("id", user.id);

        if (updateError) throw updateError;
      }

      if (!data.session) {
        alert(
          "Account created. Confirm your email, then log in. " +
          "Your profile picture must be uploaded after login. If you use username/mobile login, create a profiles row with a database trigger after email confirmation."
        );
      } else if (profileSaveFailed) {
        alert(
          "Your Supabase account was created, but its profile could not be saved. " +
          "You can log in with your email; username/mobile login needs an insert policy for the profiles table."
        );
      } else {
        alert("Signup successful!");
      }

      navigateMe("/");
    } catch (error) {
      console.error("Signup error:", error);
      alert("Signup failed: " + error.message);
    }
  };

  return (
    <div>
      <h2>Signup</h2>

      <form onSubmit={handleSubmit}>
        <input
          type="text"
          name="firstname"
          value={form.firstname}
          onChange={handleChange}
          placeholder="Enter firstname"
          required
        />
        <br /><br />

        <input
          type="text"
          name="lastname"
          value={form.lastname}
          onChange={handleChange}
          placeholder="Enter lastname"
          required
        />
        <br /><br />

        <input
          type="email"
          name="email"
          value={form.email}
          onChange={handleChange}
          placeholder="Enter email"
          required
        />
        <br /><br />

        <input
          type="text"
          name="username"
          value={form.username}
          onChange={handleChange}
          placeholder="Enter username"
          required
        />
        <br /><br />

        <input
          type="password"
          name="password"
          value={form.password}
          onChange={handleChange}
          placeholder="Enter password"
          minLength={6}
          required
        />
        <br /><br />

        <input
          type="text"
          name="mobile"
          value={form.mobile}
          onChange={handleChange}
          placeholder="Enter mobile"
          required
        />
        <br /><br />

        <select
          name="securityquestion"
          value={form.securityquestion}
          onChange={handleChange}
          required
        >
          <option>What is Your Pet Name?</option>
          <option>What is Your Best Friend Name?</option>
          <option>What is Your Teacher Name?</option>
          <option>What is Your Hobby?</option>
        </select>
        <br /><br />

        <input
          type="text"
          name="securityanswer"
          value={form.securityanswer}
          onChange={handleChange}
          placeholder="Enter security answer"
          required
        />
        <br /><br />

        <label>Upload Profile Picture:</label>
        <br />

        <input
          type="file"
          accept="image/*"
          onChange={handleImageChange}
          required
        />
        <br /><br />

        {preview && (
          <img
            src={preview}
            alt="Profile Preview"
            width="100"
            height="100"
            style={{
              borderRadius: "50%",
              objectFit: "cover",
            }}
          />
        )}

        <br /><br />

        <button type="submit">Signup</button>
      </form>
    </div>
  );
};

export default Signup;
