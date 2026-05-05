export default function LoginPage() {
  return (
    <form>
      <h1>Sign in</h1>
      <label>Email<input name="email" /></label>
      <label>Password<input name="password" type="password" /></label>
      <button type="submit">Sign in</button>
    </form>
  );
}
