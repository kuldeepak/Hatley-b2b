document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("rep-company-assignment");
  if (!container) return;

  const customerId = container.dataset.customerId;
  if (!customerId) {
    container.innerHTML = "<p>Customer not logged in.</p>";
    return;
  }

  // Helper to fetch data from proxy
  async function proxyFetch(payload) {
    const res = await fetch("/apps/proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error("Proxy request failed");
    return res.json();
  }

  try {
    // 1️⃣ Fetch current customer company
    const data = await proxyFetch({ customerId, actionType: "fetchCompany" });
    const company = data.company || null;
    const repCode = data.repCode || "";

    if (!company) {
      container.innerHTML = "<p>No company assigned to you.</p>";
      return;
    }

    // 2️⃣ Fetch other companies for this repCode
    const repCompaniesData = await proxyFetch({
      actionType: "fetchRepCompanies",
      repCode,
    });
    const repCompanies = repCompaniesData.companies || [];

    // 3️⃣ Render selector UI
    container.innerHTML = `
      <p>Current Company: <strong>${company.name}</strong></p>
      <select id="company-selector">
        <option value="">-- Select Company --</option>
      </select>
      <button id="assign-btn">Assign to selected company</button>
      <div id="assign-msg"></div>
    `;

    const selector = document.getElementById("company-selector");
    repCompanies
      .filter((c) => c.id !== company.id)
      .forEach((c) => {
        const option = document.createElement("option");
        option.value = c.id;
        option.textContent = c.name;
        selector.appendChild(option);
      });

    // 4️⃣ Handle assign button click
    document.getElementById("assign-btn").addEventListener("click", async () => {
      const newCompanyId = selector.value;
      const msgDiv = document.getElementById("assign-msg");

      if (!newCompanyId) {
        msgDiv.textContent = "Please select a company.";
        msgDiv.style.color = "red";
        return;
      }

      if (newCompanyId === company.id) {
        msgDiv.textContent = "Already assigned to this company.";
        msgDiv.style.color = "orange";
        return;
      }

      try {
        const assignResult = await proxyFetch({
          actionType: "assignCompany",
          customerId,
          companyId: newCompanyId,
        });

        if (assignResult.success) {
          msgDiv.textContent = "Customer reassigned successfully!";
          msgDiv.style.color = "green";
          setTimeout(() => location.reload(), 1000);
        } else {
          msgDiv.textContent = "Error: " + (assignResult.error || "Unknown");
          msgDiv.style.color = "red";
        }
      } catch (err) {
        console.error(err);
        msgDiv.textContent = "Failed to assign customer.";
        msgDiv.style.color = "red";
      }
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = "<p>Failed to load company info.</p>";
  }
});