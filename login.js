async function handleLogin(event) {
    event.preventDefault();

    // Reset previous errors
    hideAlert();
    const button = document.getElementById('login-button');
    const spinner = document.getElementById('spinner');

    // Show loading state
    button.classList.add('loading');
    button.disabled = true;
    // spinner.style.display = 'block';
    button.textContent = 'Logging in...';

    try {
        // Create FormData object from the form
        const formData = new FormData(event.target);

        const response = await fetch('https://cors-anywhere.herokuapp.com/http://sinhvien.ulsa.edu.vn/Login.aspx', {
            method: 'POST',
            body: formData
        });
        const data = await response.text();
        console.log("data", data);

        const isLoginNotSuccess = data.includes('Tên đăng nhập và mật khẩu không hợp lệ, bạn nhập lại !');
        if (isLoginNotSuccess) {
            showAlert('Invalid student ID or password. Please try again.', 'error');
            return;
        } else {
            showAlert('Login successful. Redirecting...', 'success');
        }
    } catch (error) {
        showAlert('Network error. Please try again later.', 'error');
        console.error('Login error:', error);
    } finally {
        // Reset button state
        button.classList.remove('loading');
        button.disabled = false;
        spinner.style.display = 'none';
        button.textContent = 'Log In';
    }
}

function showAlert(message, type) {
    const alert = document.getElementById('alert');
    alert.textContent = message;
    alert.className = `alert ${type}`;
    alert.style.display = 'block';
}

function hideAlert() {
    const alert = document.getElementById('alert');
    alert.style.display = 'none';
}
document.getElementById("upload-button").addEventListener("click", function () {
    window.location.href = "upload.html";
});