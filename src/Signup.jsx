
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";

const hashSecurityAnswer = async (answer) => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(answer.trim().normalize("NFKC").toLowerCase()),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 210000, hash: "SHA-256" },
    key,
    256,
  );
  const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes));
  return `pbkdf2-sha256$210000$${toBase64(salt)}$${toBase64(new Uint8Array(hash))}`;
};

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
      const securityAnswerHash = await hashSecurityAnswer(form.securityanswer);

      // 1. Register the account
      const { data, error } = await supabase.auth.signUp({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        options: {
          data: {
            firstname: form.firstname,
            lastname: form.lastname,
            mobile: form.mobile,
            username: form.username.trim().toLowerCase(),
            securityquestion: form.securityquestion,
            securityanswer: securityAnswerHash,
          },
        },
      });

      if (error) throw error;

      const user = data.user;

      if (!user) {
        throw new Error("Account creation failed.");
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
