const values = ["+2.84%", "+3.02%", "-3.17%", "+3.48%"];
const badge = document.getElementById("status-badge");
const price = document.getElementById("price-value");
const button = document.getElementById("demo-button");

if (badge && price && button) {
  let index = 0;

  button.addEventListener("click", () => {
    index = (index + 1) % values.length;
    const current = values[index];
    price.textContent = current;

    if (current.startsWith("+3") || current.startsWith("-3")) {
      badge.textContent = "电话触发中";
      badge.style.background = "rgba(255, 117, 117, 0.16)";
      badge.style.color = "#ff8e8e";
      button.textContent = "已模拟触发";
    } else {
      badge.textContent = "已布防";
      badge.style.background = "rgba(43, 213, 118, 0.12)";
      badge.style.color = "#2bd576";
      button.textContent = "模拟触发";
    }
  });
}
