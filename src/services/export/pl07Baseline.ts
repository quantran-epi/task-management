export const PL07_BASELINE_SOURCE_SHA256 = "9ccbc967884ccf8b1e1010566a37f9f554227fbdb208761728e8f3ad320f0b94" as const;

export const PL07_BASELINE = deepFreeze({
  "schemaVersion": 1,
  "extractionVersion": "ooXML-1.0.0",
  "sourcePath": "docs/pl-templates/PL07-tokenization-ctm.docx",
  "sourceSha256": "9ccbc967884ccf8b1e1010566a37f9f554227fbdb208761728e8f3ad320f0b94",
  "exactTextRule": "Concatenate w:t runs in document order; decode XML entities; preserve source punctuation, Unicode, item order, and explicit sub-item prefixes.",
  "sections": [
    {
      "id": "I",
      "title": "Kiểm soát đầu vào dữ liệu",
      "items": [
        {
          "number": "1",
          "text": "Mọi quá trình kiểm soát đầu vào dữ liệu đều phải được thực hiện trên phía server."
        },
        {
          "number": "2",
          "text": "Tạo một danh sách các kí tự được phép sử dụng và loại bỏ các kí tự đặc biệt hoặc có cơ chế chuyển đổi các ký tự đặc biệt thành các kí tự thông thường trước khi xử lý dữ liệu."
        },
        {
          "number": "3",
          "text": "Kiểm tra định dạng dữ liệu mong muốn khi nhận được dữ liệu ở phía server. Ví dụ: khi nhận được file PDF, server phải kiểm tra thực sự nó có phải là file PDF hay không chứ không chỉ kiểm tra mỗi tên file (.PDF)"
        },
        {
          "number": "4",
          "text": "Kiểm tra độ dài dữ liệu trước khi xử lý. Ví dụ: Khi nhận được thông tin trừ trường họ và tên chỉ phải giới hạn độ dài nhận được < 100 kí tự."
        },
        {
          "number": "5",
          "text": "Kiểm tra giới hạn giá trị của dữ liệu trước khi xử lý. Ví dụ: Khi nhận được thông tin về năm phải giới hạn dữ liệu nhận được trong khoảng 1900->2100."
        },
        {
          "number": "6",
          "text": "Nếu ứng dụng có chức năng chuyển hướng người dùng (redirect), tạo danh sách các địa chỉ hợp pháp, kiểm tra thông tin trước khi thực hiện chuyển hướng người dùng."
        }
      ]
    },
    {
      "id": "II",
      "title": "Quản lý mật khẩu và xác thực",
      "items": [
        {
          "number": "1",
          "text": "Yêu cầu xác thực cho toàn bộ các trang của ứng dụng, trừ một số trang thông tin công khai và trang đăng nhập."
        },
        {
          "number": "2",
          "text": "Ứng dụng phải sử dụng hàm băm SHA-256 để lưu mật khẩu, không được lưu mật khẩu dưới dạng clear-text hoặc sử dụng các hàm băm không an toàn như MD5."
        },
        {
          "number": "3",
          "text": "Khi đăng nhập, dữ liệu trả về phải đồng nhất để tránh tình trạng dò đoán thông tin. Ví dụ: không hiển thị “Invalid username” và “Invalid password”, mà chỉ hiển thị “Invalid username and/or password”."
        },
        {
          "number": "4",
          "text": "Chỉ sử dụng phương thức HTTP POST khi thực hiện đăng nhập."
        },
        {
          "number": "5",
          "text": "Mật khẩu của người dùng phải tuân theo chính sách sau:",
          "subItems": [
            {
              "number": "a",
              "text": "- Độ dài mật khẩu tối thiểu là 7 ký tự."
            },
            {
              "number": "b",
              "text": "- Độ phức tạp của mật khẩu: Bao gồm các ký tự số, chữ và các ký tự đặc biệt khác."
            },
            {
              "number": "c",
              "text": "- Không hiển thị mật khẩu người dùng dưới dạng clear-text khi đăng nhập."
            },
            {
              "number": "d",
              "text": "- Khi người dùng nhập sai quá 3 lần phải yêu cầu nhập captcha trước khi đăng nhập, và sai quá 5 lần sẽ khóa tài khoản trong vòng 15 phút."
            }
          ]
        },
        {
          "number": "6",
          "text": "Mật khẩu tạm thời hoặc link khôi phục mậu khẩu phải có thời gian hết hạn là 1 ngày. Khi người dùng đăng nhập bằng mật khẩu tạm thời, phải yêu cầu người dùng đổi mật khẩu."
        },
        {
          "number": "7",
          "text": "Thông báo cho người dùng khi có yêu cầu khôi phục mật khẩu, khi đăng nhập thành công qua email hoặc số điện thoại."
        },
        {
          "number": "8",
          "text": "Hiển thị thông tin về thời gian lần đăng nhập thành công cuối cùng."
        }
      ]
    },
    {
      "id": "III",
      "title": "Quản lý phiên",
      "items": [
        {
          "number": "1",
          "text": "Sau khi người dùng đăng nhập thành công, phải tạo cho người dùng một phiên mới."
        },
        {
          "number": "2",
          "text": "Sau khi người dùng đăng xuất, hàm đăng xuất phải xóa toàn bộ phiên và ngắt mọi kết nối hiện có của người dùng."
        },
        {
          "number": "3",
          "text": "Cookies được sử dụng để định danh phiên đăng nhập phải xác định cụ thể domain và path."
        },
        {
          "number": "4",
          "text": "Tự động xóa phiên khi người dùng không sử dụng trong 15 phút."
        },
        {
          "number": "5",
          "text": "Chỉ cho phép duy nhất một phiên đăng nhập tại một thời điểm"
        }
      ]
    },
    {
      "id": "IV",
      "title": "Hạn chế truy cập",
      "items": [
        {
          "number": "1",
          "text": "Giao diện hiển thị phải tương đồng với quyền của người dùng."
        },
        {
          "number": "2",
          "text": "Thực hiện kiểm tra quyền người dùng trước khi truy cập đến các chức năng, URL, API và dữ liệu. Việc kiểm tra phải được thực hiện phía server"
        },
        {
          "number": "3",
          "text": "Giới hạn số lần giao dịch/truy cập đối với từng người dùng trong một khoảng thời gian nhất định."
        },
        {
          "number": "4",
          "text": "Không chấp nhận các request có trường “referer” trong header từ một trang web khác"
        },
        {
          "number": "5",
          "text": "Tất cả các POST request phải có CSRF token"
        }
      ]
    },
    {
      "id": "V",
      "title": "Xử lý lỗi và lưu log",
      "items": [
        {
          "number": "1",
          "text": "Không để lộ các thông tin quan trọng trong thông báo lỗi, như thông tin hệ thống, thông tin session, thông tin tài khoản,…"
        },
        {
          "number": "2",
          "text": "Lưu log toàn bộ các thông tin đăng nhập không hợp lệ."
        },
        {
          "number": "3",
          "text": "Lưu log toàn bộ các hoạt động của user quản trị."
        }
      ]
    }
  ]
} as const);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export type Pl07Baseline = typeof PL07_BASELINE;
