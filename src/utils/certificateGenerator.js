// backend/src/utils/certificateGenerator.js
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generate a donation certificate PDF
 * @param {Object} data - Certificate data
 * @param {string} data.donorName - Name of the donor
 * @param {string} data.hospitalName - Name of the hospital
 * @param {string} data.bloodGroup - Blood group donated
 * @param {number} data.units - Number of units donated
 * @param {Date} data.donationDate - Date of donation
 * @param {string} data.certificateId - Unique certificate ID
 * @returns {Promise<string>} - Path to generated PDF
 */
export const generateCertificate = (data) => {
  return new Promise((resolve, reject) => {
    try {
      const {
        donorName,
        hospitalName,
        bloodGroup,
        units,
        donationDate,
        certificateId,
      } = data;

      // Create certificates directory if it doesn't exist
      const certsDir = path.join(__dirname, "../../certificates");
      if (!fs.existsSync(certsDir)) {
        fs.mkdirSync(certsDir, { recursive: true });
      }

      const fileName = `certificate_${certificateId}.pdf`;
      const filePath = path.join(certsDir, fileName);

      // Create PDF document
      const doc = new PDFDocument({
        size: "A4",
        layout: "landscape",
        margin: 50,
      });

      // Pipe to file
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // Add certificate content
      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;

      // Border
      doc
        .roundedRect(30, 30, pageWidth - 60, pageHeight - 60, 10)
        .lineWidth(3)
        .strokeColor("#e63946")
        .stroke();

      doc
        .roundedRect(40, 40, pageWidth - 80, pageHeight - 80, 8)
        .lineWidth(1)
        .strokeColor("#e63946")
        .stroke();

      // Title
      doc
        .fontSize(32)
        .fillColor("#e63946")
        .font("Helvetica-Bold")
        .text("BLOOD DONATION CERTIFICATE", 0, 100, {
          align: "center",
        });

      // Subtitle
      doc
        .fontSize(14)
        .fillColor("#666")
        .font("Helvetica")
        .text("This is to certify that", 0, 160, {
          align: "center",
        });

      // Donor name
      doc
        .fontSize(28)
        .fillColor("#1a1a1a")
        .font("Helvetica-Bold")
        .text(donorName, 0, 190, {
          align: "center",
        });

      // Description
      doc
        .fontSize(14)
        .fillColor("#666")
        .font("Helvetica")
        .text("has generously donated", 0, 235, {
          align: "center",
        });

      // Blood details
      doc
        .fontSize(22)
        .fillColor("#e63946")
        .font("Helvetica-Bold")
        .text(`${units} unit(s) of ${bloodGroup} blood`, 0, 265, {
          align: "center",
        });

      // Hospital info
      doc
        .fontSize(14)
        .fillColor("#666")
        .font("Helvetica")
        .text(`at ${hospitalName}`, 0, 305, {
          align: "center",
        });

      // Date
      const formattedDate = new Date(donationDate).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      doc
        .fontSize(14)
        .fillColor("#666")
        .text(`on ${formattedDate}`, 0, 335, {
          align: "center",
        });

      // Appreciation message
      doc
        .fontSize(12)
        .fillColor("#1a1a1a")
        .font("Helvetica-Oblique")
        .text(
          "Your selfless act of kindness has the power to save lives.",
          0,
          380,
          {
            align: "center",
          }
        );

      doc.fontSize(12).fillColor("#1a1a1a").text("Thank you for your donation!", 0, 400, {
        align: "center",
      });

      // Digital signature section
      const signatureY = pageHeight - 150;

      // Hospital signature
      doc
        .fontSize(10)
        .fillColor("#1a1a1a")
        .font("Helvetica")
        .text("_______________________", 150, signatureY, {
          width: 200,
          align: "center",
        });

      doc
        .fontSize(10)
        .fillColor("#666")
        .font("Helvetica-Bold")
        .text(hospitalName, 150, signatureY + 20, {
          width: 200,
          align: "center",
        });

      doc
        .fontSize(9)
        .fillColor("#999")
        .font("Helvetica")
        .text("Authorized Signature", 150, signatureY + 35, {
          width: 200,
          align: "center",
        });

      // BloodLink logo/signature
      doc
        .fontSize(10)
        .fillColor("#1a1a1a")
        .font("Helvetica")
        .text("_______________________", pageWidth - 350, signatureY, {
          width: 200,
          align: "center",
        });

      doc
        .fontSize(10)
        .fillColor("#666")
        .font("Helvetica-Bold")
        .text("BloodLink Platform", pageWidth - 350, signatureY + 20, {
          width: 200,
          align: "center",
        });

      doc
        .fontSize(9)
        .fillColor("#999")
        .font("Helvetica")
        .text("Digital Certificate", pageWidth - 350, signatureY + 35, {
          width: 200,
          align: "center",
        });

      // Certificate ID at bottom
      doc
        .fontSize(8)
        .fillColor("#999")
        .font("Helvetica")
        .text(`Certificate ID: ${certificateId}`, 0, pageHeight - 60, {
          align: "center",
        });

      doc
        .fontSize(8)
        .fillColor("#999")
        .text(`Generated on: ${new Date().toLocaleString()}`, 0, pageHeight - 45, {
          align: "center",
        });

      // Finalize PDF
      doc.end();

      // Wait for stream to finish
      stream.on("finish", () => {
        resolve(filePath);
      });

      stream.on("error", (err) => {
        reject(err);
      });
    } catch (error) {
      reject(error);
    }
  });
};
